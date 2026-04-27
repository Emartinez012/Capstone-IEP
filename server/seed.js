// =============================================================================
// server/seed.js
// Creates test users against the EnTec degree data.
//
// IMPORTANT: Run entec_bs_seed_v2.sql BEFORE this script.
// This script owns only user/plan data. Courses and degree models are
// owned by entec_bs_seed_v2.sql and are not touched here.
//
// Run with: cd server && node seed.js
// =============================================================================
const db     = require('./db');
const bcrypt = require('bcryptjs');

// Coarse classification by course-code prefix. Phase 10 editor will let
// faculty refine these per-row; this gets us realistic categories without
// hand-tagging 31+ courses per program.
function categoryFor(courseCode) {
    const prefix = courseCode.slice(0, 3);
    if (prefix === 'ENC' || prefix === 'SPC')                  return 'GEN_ED_COMM';
    if (prefix === 'MAC' || prefix === 'STA' || prefix === 'MAD') return 'GEN_ED_MATH';
    if (prefix === 'ARH' || prefix === 'DAN' || prefix === 'PHI') return 'GEN_ED_HUMANITIES';
    if (prefix === 'POS' || prefix === 'PSY' || prefix === 'ECO') return 'GEN_ED_SOCIAL';
    if (prefix === 'AST' || prefix === 'PHY')                  return 'GEN_ED_SCIENCE';
    return 'MAJOR';
}

// Builds program_model + program_model_row for a degree program by copying
// rows out of the legacy degree_requirements/requirement_levels tables and
// appending a single elective slot to demonstrate the elective-picker shape.
// Idempotent: deletes any existing program_model rows for this program first.
async function seedProgramModelFor(client, { code, elective }) {
    // If this program already has a populated program_model (e.g., a curated
    // sequence inserted by entec_bs_seed_v2.sql for BS-AAI), leave it alone.
    // seed.js's role is to bootstrap programs that DON'T have hand-authored
    // sequences — overwriting one would silently destroy curriculum data.
    const curatedRes = await client.query(
        `SELECT 1 FROM program_model pm
         WHERE pm.program_id = $1
           AND EXISTS (
             SELECT 1 FROM program_model_row pmr
             WHERE pmr.program_model_id = pm.id
           )
         LIMIT 1`,
        [code]
    );
    if (curatedRes.rows.length) {
        console.log(`  ${code}: program_model already populated (curated sequence) — skipping rebuild`);
        return;
    }

    const dmRes = await client.query(
        `SELECT model_id, total_credits_required FROM degree_models
         WHERE degree_code = $1 LIMIT 1`,
        [code]
    );
    if (!dmRes.rows.length) {
        console.warn(`  Skipping ${code} program_model — no legacy degree_models row`);
        return;
    }
    const { model_id: legacyModelId, total_credits_required: legacyTotal } = dmRes.rows[0];

    await client.query(`DELETE FROM program_model WHERE program_id = $1`, [code]);

    const pmRes = await client.query(
        `INSERT INTO program_model (program_id, version, is_active, total_credits_required)
         VALUES ($1, 1, true, $2) RETURNING id`,
        [code, legacyTotal]
    );
    const pmId = pmRes.rows[0].id;

    const reqs = await client.query(
        `SELECT dr.course_code,
                dr.priority_value AS priority,
                COALESCE(MAX(rl.level_value), 1) AS level
         FROM degree_requirements dr
         LEFT JOIN requirement_levels rl ON rl.requirement_id = dr.requirement_id
         WHERE dr.model_id = $1 AND dr.deleted_at IS NULL
         GROUP BY dr.course_code, dr.priority_value
         ORDER BY dr.priority_value, dr.course_code`,
        [legacyModelId]
    );

    // Existing degree_requirements share priority_value across many rows, but
    // program_model_row.priority is UNIQUE per program_model_id. Number rows
    // 1..N in the order returned to give the faculty editor a stable starting
    // point. The original priority_value still informs the order.
    let seq = 1;
    for (const r of reqs.rows) {
        await client.query(
            `INSERT INTO program_model_row
                (program_model_id, priority, course_id, category, level,
                 is_elective, term_length, offered_in_summer)
             VALUES ($1, $2, $3, $4, $5, false, 'FULL_16_WEEK', true)`,
            [pmId, seq++, r.course_code, categoryFor(r.course_code), r.level]
        );
    }

    if (elective) {
        await client.query(
            `INSERT INTO program_model_row
                (program_model_id, priority, course_id, category, level,
                 is_elective, default_course_id, allowed_course_ids,
                 term_length, offered_in_summer)
             VALUES ($1, $2, NULL, 'PROGRAM_ELECTIVE', $3, true, $4, $5,
                     'FULL_16_WEEK', true)`,
            [pmId, seq, elective.level, elective.default_course_id, elective.allowed_course_ids]
        );
        console.log(`  ${code}: ${reqs.rows.length} required rows + 1 elective slot`);
    } else {
        console.log(`  ${code}: ${reqs.rows.length} required rows (no curated elective)`);
    }
}

async function seed() {
    console.log('Starting seed...');
    const client = await db.getClient();
    try {
        await client.query(`ALTER TYPE user_role_type ADD VALUE IF NOT EXISTS 'Faculty'`);

        await client.query('BEGIN');

        // Ensure columns added by migrate() exist (safe for fresh containers)
        await client.query(`ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS starting_term VARCHAR(10) DEFAULT '242'`);
        await client.query(`ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS is_transfer BOOLEAN DEFAULT FALSE`);

        // Clear only user/plan data — curriculum tables stay intact.
        // NOTE: do NOT TRUNCATE users or departments CASCADE here.
        //   - users has 17 dependents, including degree_models.created_by and
        //     program_model.created_by — TRUNCATE CASCADE wipes curriculum.
        //   - departments has degree_programs.dept_id pointing at it, which
        //     in turn cascades to degree_models and program_model.
        // Instead, TRUNCATE only user-derived tables explicitly, then
        // DELETE FROM users (which respects ON DELETE NO ACTION + NULL FKs).
        // Departments are find-or-created below so duplicate rows don't
        // accumulate. Add any new user-derived tables to this list when
        // they're introduced.
        console.log('Clearing user and plan data...');
        await client.query(`
            TRUNCATE TABLE
                schedule_items, generated_schedules, academic_history,
                iep_status_history, iep_snapshots, iep_note,
                student_profiles, advisor_profiles, advisor_program_assignments
            CASCADE
        `);
        await client.query(`DELETE FROM users`);

        // Look up model IDs from the SQL-seeded degree models
        const seModelRes = await client.query(
            `SELECT model_id FROM degree_models WHERE degree_code = 'BS-ISTS' LIMIT 1`
        );
        if (!seModelRes.rows.length) {
            throw new Error('BS-ISTS degree model not found. Apply entec_bs_seed_v2.sql before running seed.js.');
        }
        const seModelId = seModelRes.rows[0].model_id;
        const seDegreeCode = 'BS-ISTS';

        const aiModelRes = await client.query(
            `SELECT model_id FROM degree_models WHERE degree_code = 'BS-AAI' LIMIT 1`
        );
        if (!aiModelRes.rows.length) {
            throw new Error('BS-AAI degree model not found. Apply entec_bs_seed_v2.sql before running seed.js.');
        }
        const aiModelId = aiModelRes.rows[0].model_id;
        const aiDegreeCode = 'BS-AAI';

        // Build program_model + program_model_row for every degree_model in
        // the DB. Two programs (BS-AAI, BS-ISTS) get a curated elective slot
        // for the Phase 8 ElectivePicker demo; the rest get required rows
        // only (faculty can add their own electives later via Phase 10 editor
        // — once the Phase 12 row-add CRUD lands).
        const PROGRAM_ELECTIVES = {
            'BS-AAI': {
                level: 4,
                default_course_id: 'GEB1432',
                allowed_course_ids: ['GEB1432', 'HSC2060', 'ETS1603C', 'CTS1145'],
            },
            'BS-ISTS': {
                level: 4,
                default_course_id: 'CIS4347',
                allowed_course_ids: ['CIS4347', 'CTS1650', 'CNT4603'],
            },
        };
        console.log('Seeding program models...');
        const programsRes = await client.query(
            `SELECT DISTINCT degree_code FROM degree_models WHERE deleted_at IS NULL
             ORDER BY degree_code`
        );
        for (const row of programsRes.rows) {
            await seedProgramModelFor(client, {
                code:     row.degree_code,
                elective: PROGRAM_ELECTIVES[row.degree_code], // undefined when uncurated
            });
        }

        // Find-or-create the department for advisor profiles. Departments are
        // shared with degree_programs.dept_id so we don't TRUNCATE them above;
        // re-running the seed would otherwise pile up duplicate rows.
        const deptName = 'Engineering, Technology & Design';
        let deptLookup = await client.query(
            `SELECT dept_id FROM departments WHERE dept_name = $1 LIMIT 1`,
            [deptName]
        );
        if (!deptLookup.rows.length) {
            deptLookup = await client.query(
                `INSERT INTO departments (dept_name) VALUES ($1) RETURNING dept_id`,
                [deptName]
            );
        }
        const deptId = deptLookup.rows[0].dept_id;

        // --- Test Users ---
        console.log('Creating test users...');

        const studentHash = await bcrypt.hash('password123', 10);

        // Student 1: BS-ISTS (Software Engineering, profile complete — goes straight to dashboard)
        const student1Res = await client.query(
            `INSERT INTO users (first_name, last_name, email, password_hash, role)
             VALUES ('Alex', 'Martinez', 'student1@mdc.edu', $1, 'Student') RETURNING user_id`,
            [studentHash]
        );
        await client.query(
            `INSERT INTO student_profiles
                (user_id, student_id, degree_code, current_degree_model_id, target_credits, starting_term, opt_out_summer)
             VALUES ($1, 'MDC-10001', $2, $3, 12, '252', false)`,
            [student1Res.rows[0].user_id, seDegreeCode, seModelId]
        );
        await client.query(`
            UPDATE student_profiles SET
                preferred_campus_location = 'Kendall',
                preferred_modality        = '["In-Person"]',
                preferred_time_slot       = '{"blocks":["Morning"],"pattern":"MWF"}'
            WHERE user_id = $1
        `, [student1Res.rows[0].user_id]);

        // Advisor 1: advisor1@mdc.edu — BS-AAI
        const advisorHash = await bcrypt.hash('password123', 10);
        const advisor1Res = await client.query(
            `INSERT INTO users (first_name, last_name, email, password_hash, role)
             VALUES ('Maria', 'Sanchez', 'advisor1@mdc.edu', $1, 'Advisor') RETURNING user_id`,
            [advisorHash]
        );
        const advisor1Id = advisor1Res.rows[0].user_id;
        await client.query(`INSERT INTO advisor_profiles (user_id, dept_id, max_student_load) VALUES ($1, $2, 50)`, [advisor1Id, deptId]);
        await client.query(`INSERT INTO advisor_program_assignments (advisor_user_id, degree_code) VALUES ($1, $2)`, [advisor1Id, aiDegreeCode]);

        // Advisor 2: advisor2@mdc.edu — BS-ISTS
        const advisor2Res = await client.query(
            `INSERT INTO users (first_name, last_name, email, password_hash, role)
             VALUES ('Carlos', 'Reyes', 'advisor2@mdc.edu', $1, 'Advisor') RETURNING user_id`,
            [advisorHash]
        );
        const advisor2Id = advisor2Res.rows[0].user_id;
        await client.query(`INSERT INTO advisor_profiles (user_id, dept_id, max_student_load) VALUES ($1, $2, 50)`, [advisor2Id, deptId]);
        await client.query(`INSERT INTO advisor_program_assignments (advisor_user_id, degree_code) VALUES ($1, $2)`, [advisor2Id, seDegreeCode]);

        // Faculty chairperson
        const chairHash = await bcrypt.hash('password123', 10);
        await client.query(
            `INSERT INTO users (first_name, last_name, email, password_hash, role)
             VALUES ('Dr. James', 'Rivera', 'chair1@mdc.edu', $1, 'Faculty')`,
            [chairHash]
        );

        // Extra students with varied campus/modality preferences
        const extraStudents = [
            { first: 'Sofia',  last: 'Torres',   email: 'student2@mdc.edu', sid: 'MDC-10002',
              degree: seDegreeCode, modelId: seModelId, credits: 12, term: '261',
              campus: 'Kendall',   modality: '["In-Person"]',
              slot: '{"blocks":["Afternoon"],"pattern":"TTh"}' },
            { first: 'Marcus', last: 'Williams', email: 'student3@mdc.edu', sid: 'MDC-10003',
              degree: seDegreeCode, modelId: seModelId, credits: 9,  term: '261',
              campus: 'Wolfson',   modality: '["Blended"]',
              slot: '{"blocks":["Morning","Afternoon"],"pattern":"MWF"}' },
            { first: 'Priya',  last: 'Patel',    email: 'student4@mdc.edu', sid: 'MDC-10004',
              degree: aiDegreeCode, modelId: aiModelId, credits: 12, term: '261',
              campus: 'Homestead', modality: '["In-Person"]',
              slot: '{"blocks":["Morning"],"pattern":"MWF"}' },
            { first: 'Jordan', last: 'Chen',     email: 'student5@mdc.edu', sid: 'MDC-10005',
              degree: aiDegreeCode, modelId: aiModelId, credits: 15, term: '252',
              campus: null,        modality: '["Online"]',
              slot: '{"blocks":["Evening"],"pattern":"MWF"}' },
            { first: 'Amara',  last: 'Osei',     email: 'student6@mdc.edu', sid: 'MDC-10006',
              degree: aiDegreeCode, modelId: aiModelId, credits: 12, term: '261',
              campus: 'North',     modality: '["In-Person","Blended"]',
              slot: '{"blocks":["Afternoon"],"pattern":"MWF"}' },
            { first: 'Luis',   last: 'Mendoza',  email: 'student7@mdc.edu', sid: 'MDC-10007',
              degree: seDegreeCode, modelId: seModelId, credits: 12, term: '261',
              campus: 'Wolfson',   modality: '["In-Person"]',
              slot: '{"blocks":["Morning"],"pattern":"TTh"}' },
        ];

        const programAdvisorMap = {
            [seDegreeCode]: advisor2Id,
            [aiDegreeCode]: advisor1Id,
        };

        for (const s of extraStudents) {
            const uRes = await client.query(
                `INSERT INTO users (first_name, last_name, email, password_hash, role)
                 VALUES ($1, $2, $3, $4, 'Student') RETURNING user_id`,
                [s.first, s.last, s.email, studentHash]
            );
            const uid = uRes.rows[0].user_id;
            await client.query(
                `INSERT INTO student_profiles
                    (user_id, student_id, degree_code, current_degree_model_id,
                     target_credits, starting_term, opt_out_summer, is_transfer,
                     preferred_campus_location, preferred_modality, preferred_time_slot,
                     assigned_advisor_id)
                 VALUES ($1, $2, $3, $4, $5, $6, false, false, $7, $8::jsonb, $9::jsonb, $10)`,
                [uid, s.sid, s.degree, s.modelId, s.credits, s.term,
                 s.campus || null, s.modality, s.slot,
                 programAdvisorMap[s.degree] || null]
            );
        }

        // Auto-assign student1 to advisor2 (BS-ISTS)
        await client.query(
            `UPDATE student_profiles SET assigned_advisor_id = $1 WHERE user_id = $2`,
            [advisor2Id, student1Res.rows[0].user_id]
        );

        // Pre-wire each student to the active program_model for their degree.
        // The Phase 6 generator will read selected_program_model_id; the legacy
        // current_degree_model_id stays populated for the existing algorithm.
        await client.query(`
            UPDATE student_profiles sp
            SET selected_program_model_id = pm.id
            FROM program_model pm
            WHERE pm.is_active = true AND pm.program_id = sp.degree_code
        `);

        await client.query('COMMIT');
        console.log('Seeding completed successfully!');
        console.log('  student1@mdc.edu / password123  (BS-ISTS — Software Engineering, Kendall)');
        console.log('  student2@mdc.edu / password123  (BS-ISTS — Software Engineering, Kendall)');
        console.log('  student3@mdc.edu / password123  (BS-ISTS — Software Engineering, Wolfson)');
        console.log('  student4@mdc.edu / password123  (BS-AAI  — Applied AI, Homestead)');
        console.log('  student5@mdc.edu / password123  (BS-AAI  — Applied AI, Online)');
        console.log('  student6@mdc.edu / password123  (BS-AAI  — Applied AI, North)');
        console.log('  student7@mdc.edu / password123  (BS-ISTS — Software Engineering, Wolfson)');
        console.log('  advisor1@mdc.edu / password123  (Advisor — Maria Sanchez, BS-AAI)');
        console.log('  advisor2@mdc.edu / password123  (Advisor — Carlos Reyes, BS-ISTS)');
        console.log('  chair1@mdc.edu   / password123  (Faculty Chairperson — Dr. James Rivera)');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Seeding failed, rolled back:', err.message);
    } finally {
        client.release();
        process.exit();
    }
}

seed();
