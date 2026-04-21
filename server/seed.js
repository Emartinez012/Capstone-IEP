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

async function seed() {
    console.log('Starting seed...');
    const client = await db.getClient();
    try {
        await client.query(`ALTER TYPE user_role_type ADD VALUE IF NOT EXISTS 'Faculty'`);

        await client.query('BEGIN');

        // Ensure columns added by migrate() exist (safe for fresh containers)
        await client.query(`ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS starting_term VARCHAR(10) DEFAULT '242'`);
        await client.query(`ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS is_transfer BOOLEAN DEFAULT FALSE`);

        // Clear only user/plan data — degree and course tables are owned by the SQL seed file
        console.log('Clearing user and plan data...');
        await client.query(`
            TRUNCATE TABLE
                schedule_items, generated_schedules, academic_history,
                student_profiles, advisor_profiles, advisor_program_assignments,
                departments, users
            CASCADE
        `);

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

        // Create department for advisor profile FK
        const deptRes = await client.query(
            `INSERT INTO departments (dept_name) VALUES ($1) RETURNING dept_id`,
            ['Engineering, Technology & Design']
        );
        const deptId = deptRes.rows[0].dept_id;

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
