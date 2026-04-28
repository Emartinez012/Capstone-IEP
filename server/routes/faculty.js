// =============================================================================
// server/routes/faculty.js
// API routes shared by both the Chairperson and Advisor dashboards.
//
// Real schedule_status_type enum values:
//   Temporary | Official | Pending Review | Advisor Modified |
//   Pending_Student_Acceptance | Pending_Advisor_Review
//
// "Pending_Advisor_Review" is what the UI shows as "Needs Review / Submitted".
// "Temporary" is the default state after generation (returned-for-revision too).
// =============================================================================

const express = require('express');
const router  = express.Router();
const db      = require('../db');

// Helper — convert YYT term code to readable label
function termLabel(code) {
  if (!code) return '—';
  const s  = String(code);
  const yy = parseInt(s.slice(0, 2), 10);
  const t  = s.slice(2);
  const yr = 2000 + yy;
  if (t === '1') return `Fall ${yr}`;
  if (t === '2') return `Spring ${yr + 1}`;
  if (t === '3') return `Summer ${yr + 1}`;
  return code;
}

// ── GET /api/faculty/overview ─────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const deptRes = await db.query(
      `SELECT dept_id, dept_name FROM departments ORDER BY dept_name`
    );

    const programRes = await db.query(`
      SELECT dp.degree_code, dp.program_name, dp.dept_id, dp.department_name,
             COUNT(sp.user_id)::int AS student_count
      FROM   degree_programs dp
      LEFT JOIN student_profiles sp ON sp.degree_code = dp.degree_code
      GROUP  BY dp.degree_code, dp.program_name, dp.dept_id, dp.department_name
      ORDER  BY dp.program_name
    `);

    const advisorRes = await db.query(`
      SELECT u.user_id, u.first_name, u.last_name,
             ap.dept_id, ap.max_student_load,
             COUNT(sp.user_id)::int AS current_load,
             COALESCE(
               json_agg(DISTINCT apa.degree_code)
               FILTER (WHERE apa.degree_code IS NOT NULL), '[]'
             ) AS programs
      FROM   users u
      JOIN   advisor_profiles ap ON ap.user_id = u.user_id
      LEFT JOIN advisor_program_assignments apa ON apa.advisor_user_id = u.user_id
      LEFT JOIN student_profiles sp ON sp.assigned_advisor_id = u.user_id
      WHERE  u.role = 'Advisor'
      GROUP  BY u.user_id, u.first_name, u.last_name, ap.dept_id, ap.max_student_load
      ORDER  BY u.last_name, u.first_name
    `);

    const studentRes = await db.query(`
      SELECT u.user_id, u.first_name, u.last_name,
             sp.degree_code, sp.assigned_advisor_id,
             CASE
               WHEN gs.schedule_id IS NULL
                 THEN 'no-plan'
               WHEN gs.status = 'Pending_Advisor_Review'
                 THEN 'needs-review'
               WHEN sp.academic_standing IN ('Probation','Suspension')
                 THEN 'at-risk'
               ELSE 'on-track'
             END AS status
      FROM   users u
      JOIN   student_profiles sp ON sp.user_id = u.user_id
      LEFT JOIN LATERAL (
        SELECT schedule_id, status
        FROM   generated_schedules
        WHERE  student_user_id = u.user_id
          AND  deleted_at IS NULL
        ORDER  BY created_at DESC LIMIT 1
      ) gs ON true
      WHERE  u.role = 'Student'
      ORDER  BY u.last_name, u.first_name
    `);

    // Build the department list: real departments + a synthetic bucket for any
    // programs whose dept_id is NULL and whose department_name doesn't match
    // any existing dept. This keeps Drill-Down showing programs even when the
    // SQL seed left dept_id unlinked.
    const realDeptNames = new Set(deptRes.rows.map(d => d.dept_name));
    const orphanGroups  = new Map(); // department_name -> [program rows]
    for (const p of programRes.rows) {
      if (p.dept_id) continue;
      if (p.department_name && realDeptNames.has(p.department_name)) continue;
      const key = p.department_name || 'Unaffiliated';
      if (!orphanGroups.has(key)) orphanGroups.set(key, []);
      orphanGroups.get(key).push(p);
    }
    const allDepts = [
      ...deptRes.rows,
      ...[...orphanGroups.keys()].map(name => ({
        dept_id: `orphan_${name}`,
        dept_name: name,
        _orphan: true,
      })),
    ];

    const departments = allDepts.map(dept => {
      const programs = programRes.rows
        .filter(p =>
          dept._orphan
            ? !p.dept_id && (p.department_name || 'Unaffiliated') === dept.dept_name
            : (p.dept_id === dept.dept_id ||
               (!p.dept_id && p.department_name && p.department_name === dept.dept_name))
        )
        .map(prog => {
          const advisors = advisorRes.rows
            .filter(a =>
              dept._orphan
                ? a.programs.includes(prog.degree_code)
                : (a.dept_id === dept.dept_id &&
                   (a.programs.includes(prog.degree_code) || a.programs.length === 0))
            )
            .map(adv => ({
              advisor_id:   adv.user_id,
              name:         `${adv.first_name} ${adv.last_name}`,
              current_load: adv.current_load,
              max_capacity: adv.max_student_load || 50,
              students: studentRes.rows
                .filter(s =>
                  s.assigned_advisor_id === adv.user_id &&
                  s.degree_code === prog.degree_code
                )
                .map(s => ({
                  user_id:     s.user_id,
                  name:        `${s.first_name} ${s.last_name}`,
                  degree_code: s.degree_code,
                  status:      s.status,
                })),
            }));

          const unassigned = studentRes.rows
            .filter(s => !s.assigned_advisor_id && s.degree_code === prog.degree_code)
            .map(s => ({
              user_id:     s.user_id,
              name:        `${s.first_name} ${s.last_name}`,
              degree_code: s.degree_code,
              status:      s.status,
            }));

          return {
            degree_code:   prog.degree_code,
            program_name:  prog.program_name,
            student_count: prog.student_count,
            advisors,
            unassigned,
          };
        });

      const totalStudents = programs.reduce((sum, p) => sum + p.student_count, 0);
      const deptAdvisors  = advisorRes.rows.filter(a => a.dept_id === dept.dept_id);

      return {
        dept_id:        dept.dept_id,
        dept_name:      dept.dept_name,
        total_students: totalStudents,
        total_advisors: deptAdvisors.length,
        programs,
      };
    });

    res.json({ departments });
  } catch (err) {
    console.error('Overview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/faculty/students ─────────────────────────────────────────────────
router.get('/students', async (req, res) => {
  const { term, program, campus } = req.query;
  const conditions = [`u.role = 'Student'`];
  const params     = [];

  if (term) {
    params.push(term);
    conditions.push(`sp.starting_term = $${params.length}`);
  }
  if (program) {
    params.push(program);
    conditions.push(`sp.degree_code = $${params.length}`);
  }
  if (campus && campus !== 'all') {
    params.push(campus);
    conditions.push(`sp.preferred_campus_location = $${params.length}`);
  }

  try {
    const result = await db.query(`
      SELECT
        u.user_id, u.first_name, u.last_name,
        sp.degree_code, dp.program_name,
        sp.starting_term, sp.preferred_campus_location,
        sp.target_credits, sp.is_transfer,
        sp.preferred_modality,
        CASE
          WHEN gs.schedule_id IS NULL                   THEN 'No Plan'
          WHEN gs.status = 'Pending_Advisor_Review'     THEN 'Needs Review'
          WHEN gs.status = 'Official'                   THEN 'Approved'
          ELSE                                               'On Track'
        END AS plan_status,
        gs.projected_graduation_term
      FROM   users u
      JOIN   student_profiles sp ON sp.user_id = u.user_id
      LEFT JOIN degree_programs dp ON dp.degree_code = sp.degree_code
      LEFT JOIN LATERAL (
        SELECT schedule_id, status, projected_graduation_term
        FROM   generated_schedules
        WHERE  student_user_id = u.user_id
          AND  deleted_at IS NULL
        ORDER  BY created_at DESC LIMIT 1
      ) gs ON true
      WHERE  ${conditions.join(' AND ')}
      ORDER  BY u.last_name, u.first_name
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('Students filter error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/faculty/heatmap ──────────────────────────────────────────────────
router.get('/heatmap', async (req, res) => {
  const { program, campus, include_online } = req.query;
  const includeOnline = include_online === 'true';

  const conditions = [
    `u.role = 'Student'`,
    `sp.preferred_time_slot IS NOT NULL`,
    `sp.preferred_time_slot != 'null'::jsonb`,
    `(sp.preferred_time_slot->>'blocks') IS NOT NULL`,
  ];
  const params = [];

  if (program && program !== 'all') {
    params.push(program);
    conditions.push(`sp.degree_code = $${params.length}`);
  }
  if (campus && campus !== 'all') {
    params.push(campus);
    conditions.push(`sp.preferred_campus_location = $${params.length}`);
  }
  if (!includeOnline) {
    conditions.push(
      `(sp.preferred_modality IS NULL OR
        sp.preferred_modality = '[]'::jsonb OR
        sp.preferred_modality @> '["In-Person"]'::jsonb OR
        sp.preferred_modality @> '["Blended"]'::jsonb)`
    );
  }

  try {
    const inPersonResult = await db.query(`
      SELECT sp.preferred_time_slot, sp.preferred_modality
      FROM   users u
      JOIN   student_profiles sp ON sp.user_id = u.user_id
      WHERE  ${conditions.join(' AND ')}
    `, params);

    const onlineConditions = [`u.role = 'Student'`, `sp.preferred_modality @> '["Online"]'::jsonb`];
    if (program && program !== 'all') onlineConditions.push(`sp.degree_code = '${program.replace(/'/g, "''")}'`);
    const onlineRes = await db.query(`
      SELECT COUNT(*)::int AS cnt
      FROM   users u
      JOIN   student_profiles sp ON sp.user_id = u.user_id
      WHERE  ${onlineConditions.join(' AND ')}
    `);

    const days       = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const timeBlocks = ['Morning', 'Afternoon', 'Evening'];

    const grid = {};
    for (const block of timeBlocks) {
      grid[block] = {};
      for (const day of days) grid[block][day] = 0;
    }

    for (const row of inPersonResult.rows) {
      const ts = row.preferred_time_slot;
      if (!ts || !Array.isArray(ts.blocks) || ts.blocks.length === 0) continue;

      const pattern    = ts.pattern || 'all';
      const activeDays =
        pattern === 'MWF' ? ['Mon', 'Wed', 'Fri'] :
        pattern === 'TTh' ? ['Tue', 'Thu'] :
        days;

      for (const block of ts.blocks) {
        if (!grid[block]) continue;
        for (const day of activeDays) grid[block][day]++;
      }
    }

    res.json({
      grid,
      total_in_person: inPersonResult.rows.length,
      online_count:    onlineRes.rows[0].cnt,
    });
  } catch (err) {
    console.error('Heatmap error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/faculty/programs ─────────────────────────────────────────────────
router.get('/programs', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT dp.degree_code,
             dp.program_name,
             dp.department_name,
             COUNT(DISTINCT dr.course_code) AS course_count,
             COALESCE(SUM(c.credits), 0)    AS total_credits
      FROM degree_programs dp
      LEFT JOIN degree_models dm
             ON dm.degree_code = dp.degree_code AND dm.is_published = true
      LEFT JOIN degree_requirements dr
             ON dr.model_id = dm.model_id AND dr.deleted_at IS NULL
      LEFT JOIN courses c
             ON c.course_code = dr.course_code
      GROUP BY dp.degree_code, dp.program_name, dp.department_name
      ORDER BY dp.program_name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/faculty/programs ────────────────────────────────────────────────
// Create a degree program plus a published degree_models row so courses can
// be attached immediately.
router.post('/programs', async (req, res) => {
  const { degree_code, program_name, department_name } = req.body;
  if (!degree_code?.trim() || !program_name?.trim()) {
    return res.status(400).json({ error: 'degree_code and program_name are required.' });
  }
  const code = degree_code.trim().toUpperCase();

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const dup = await client.query(
      `SELECT 1 FROM degree_programs WHERE degree_code = $1`, [code]
    );
    if (dup.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Program ${code} already exists.` });
    }

    await client.query(
      `INSERT INTO degree_programs (degree_code, program_name, department_name)
       VALUES ($1, $2, $3)`,
      [code, program_name.trim(), department_name?.trim() || null]
    );

    await client.query(
      `INSERT INTO degree_models (degree_code, version_number, is_published)
       VALUES ($1, 1, true)`,
      [code]
    );

    await client.query('COMMIT');
    res.status(201).json({ degree_code: code, program_name: program_name.trim(),
                          department_name: department_name?.trim() || null });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create program.' });
  } finally {
    client.release();
  }
});

// ── DELETE /api/faculty/programs/:code ────────────────────────────────────────
// Refuses to delete if any student_profiles still reference this program.
router.delete('/programs/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const enrolled = await db.query(
      `SELECT COUNT(*)::int AS n FROM student_profiles WHERE degree_code = $1`, [code]
    );
    const n = enrolled.rows[0].n;
    if (n > 0) {
      return res.status(409).json({
        error: `Cannot delete: ${n} student${n === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} enrolled in this program.`,
      });
    }
    const result = await db.query(
      `DELETE FROM degree_programs WHERE degree_code = $1`, [code]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Program not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete program.' });
  }
});

// ── GET /api/faculty/terms ────────────────────────────────────────────────────
router.get('/terms', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT starting_term
      FROM   student_profiles
      WHERE  starting_term IS NOT NULL
      ORDER  BY starting_term
    `);
    res.json(result.rows.map(r => r.starting_term));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/faculty/campuses ─────────────────────────────────────────────────
router.get('/campuses', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT preferred_campus_location
      FROM   student_profiles
      WHERE  preferred_campus_location IS NOT NULL AND preferred_campus_location != ''
      ORDER  BY preferred_campus_location
    `);
    res.json(result.rows.map(r => r.preferred_campus_location));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/faculty/advisor/:id/caseload ─────────────────────────────────────
router.get('/advisor/:id/caseload', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(`
      SELECT
        u.user_id, u.first_name, u.last_name, u.email,
        sp.degree_code, dp.program_name,
        sp.starting_term, sp.target_credits, sp.is_transfer,
        sp.preferred_campus_location,
        sp.expected_graduation_date,
        CASE
          WHEN gs.schedule_id IS NULL                             THEN 'no-plan'
          WHEN gs.status = 'Pending_Advisor_Review'              THEN 'needs-review'
          WHEN gs.status = 'Official'                            THEN 'approved'
          WHEN sp.academic_standing IN ('Probation','Suspension') THEN 'at-risk'
          ELSE                                                        'on-track'
        END AS status,
        gs.projected_graduation_term,
        gs.status AS schedule_status,
        gs.schedule_id
      FROM   users u
      JOIN   student_profiles sp ON sp.user_id = u.user_id
      LEFT JOIN degree_programs dp ON dp.degree_code = sp.degree_code
      LEFT JOIN LATERAL (
        SELECT schedule_id, status, projected_graduation_term
        FROM   generated_schedules
        WHERE  student_user_id = u.user_id
          AND  deleted_at IS NULL
        ORDER  BY created_at DESC LIMIT 1
      ) gs ON true
      WHERE  u.role = 'Student' AND sp.assigned_advisor_id = $1
      ORDER  BY u.last_name, u.first_name
    `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Caseload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/faculty/advisor/:id/pending ──────────────────────────────────────
router.get('/advisor/:id/pending', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(`
      SELECT
        gs.schedule_id, gs.student_user_id, gs.projected_graduation_term,
        gs.status, gs.created_at,
        u.first_name, u.last_name,
        sp.degree_code, dp.program_name
      FROM   generated_schedules gs
      JOIN   users u  ON u.user_id = gs.student_user_id
      JOIN   student_profiles sp ON sp.user_id = gs.student_user_id
      LEFT JOIN degree_programs dp ON dp.degree_code = sp.degree_code
      WHERE  gs.status = 'Pending_Advisor_Review'
        AND  sp.assigned_advisor_id = $1
        AND  gs.deleted_at IS NULL
      ORDER  BY gs.created_at ASC
    `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Pending error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/faculty/substitutions ───────────────────────────────────────────
router.get('/substitutions', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        cs.substitution_id,
        cs.substitution_status   AS status,
        cs.submitted_at          AS created_at,
        cs.required_course_code  AS original_course_code,
        cs.original_course_code  AS substitute_course_code,
        cs.reason,
        u.first_name  AS student_first,
        u.last_name   AS student_last,
        sp.degree_code,
        ru.first_name AS reviewer_first,
        ru.last_name  AS reviewer_last
      FROM   course_substitutions cs
      JOIN   users u  ON u.user_id = cs.student_user_id
      JOIN   student_profiles sp ON sp.user_id = cs.student_user_id
      LEFT JOIN users ru ON ru.user_id = cs.assigned_reviewer_id
      WHERE  cs.substitution_status IN ('Pending','Under Review')
      ORDER  BY cs.submitted_at ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Substitutions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/faculty/advisors ─────────────────────────────────────────────────
// All advisors with their program assignments and current caseload size.
router.get('/advisors', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.user_id, u.first_name, u.last_name, u.email,
             ap.max_student_load,
             COUNT(DISTINCT sp.user_id)::int AS current_load,
             COALESCE(
               json_agg(DISTINCT jsonb_build_object('code', apa.degree_code, 'name', dp.program_name))
               FILTER (WHERE apa.degree_code IS NOT NULL), '[]'
             ) AS programs
      FROM   users u
      JOIN   advisor_profiles ap ON ap.user_id = u.user_id
      LEFT JOIN advisor_program_assignments apa ON apa.advisor_user_id = u.user_id
      LEFT JOIN degree_programs dp ON dp.degree_code = apa.degree_code
      LEFT JOIN student_profiles sp ON sp.assigned_advisor_id = u.user_id
      WHERE  u.role = 'Advisor' AND u.deleted_at IS NULL
      GROUP  BY u.user_id, u.first_name, u.last_name, u.email, ap.max_student_load
      ORDER  BY u.last_name, u.first_name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Advisors error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/faculty/advisors ────────────────────────────────────────────────
// Create a new advisor account.
// Body: { first_name, last_name, email, password?, programs: string[], max_student_load? }
router.post('/advisors', async (req, res) => {
  const bcrypt = require('bcryptjs');
  const { first_name, last_name, email, password, programs = [], max_student_load = 50 } = req.body;
  if (!first_name || !last_name || !email) {
    return res.status(400).json({ error: 'first_name, last_name, and email are required.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const hash = await bcrypt.hash(password || 'ChangeMe123!', 10);
    const userRes = await client.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,'Advisor') RETURNING user_id`,
      [first_name, last_name, email, hash]
    );
    const advisorId = userRes.rows[0].user_id;

    // Derive dept_id from the first assigned program, fall back to first department
    let deptId = null;
    if (programs.length > 0) {
      const dr = await client.query(
        `SELECT dept_id FROM degree_programs WHERE degree_code = $1`, [programs[0]]
      );
      deptId = dr.rows[0]?.dept_id || null;
    }
    if (!deptId) {
      const dr = await client.query(`SELECT dept_id FROM departments LIMIT 1`);
      deptId = dr.rows[0]?.dept_id || null;
    }

    await client.query(
      `INSERT INTO advisor_profiles (user_id, dept_id, max_student_load) VALUES ($1,$2,$3)`,
      [advisorId, deptId, max_student_load]
    );

    for (const code of programs) {
      await client.query(
        `INSERT INTO advisor_program_assignments (advisor_user_id, degree_code)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [advisorId, code]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, advisor_id: advisorId });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists.' });
    console.error('Create advisor error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── PUT /api/faculty/advisors/:id/programs ────────────────────────────────────
// Replace an advisor's program assignments entirely.
// Body: { programs: string[] }
router.put('/advisors/:id/programs', async (req, res) => {
  const { id } = req.params;
  const { programs = [] } = req.body;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM advisor_program_assignments WHERE advisor_user_id = $1`, [id]
    );
    for (const code of programs) {
      await client.query(
        `INSERT INTO advisor_program_assignments (advisor_user_id, degree_code)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [id, code]
      );
    }
    // Update dept_id to match the first new program
    if (programs.length > 0) {
      const dr = await client.query(
        `SELECT dept_id FROM degree_programs WHERE degree_code = $1`, [programs[0]]
      );
      if (dr.rows[0]?.dept_id) {
        await client.query(
          `UPDATE advisor_profiles SET dept_id = $1 WHERE user_id = $2`,
          [dr.rows[0].dept_id, id]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update programs error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── PUT /api/faculty/students/:id/assign ──────────────────────────────────────
// Assign (or unassign) a student to an advisor.
// Body: { advisor_id: string | null }
router.put('/students/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { advisor_id } = req.body;
  try {
    await db.query(
      `UPDATE student_profiles SET assigned_advisor_id = $1 WHERE user_id = $2`,
      [advisor_id || null, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Assign error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/faculty/programs/:code/auto-assign ──────────────────────────────
// Assigns all unassigned students in a program to that program's advisor.
router.post('/programs/:code/auto-assign', async (req, res) => {
  const { code } = req.params;
  try {
    const advisorRes = await db.query(
      `SELECT advisor_user_id FROM advisor_program_assignments WHERE degree_code = $1 LIMIT 1`,
      [code]
    );
    if (advisorRes.rows.length === 0) {
      return res.status(404).json({ error: 'No advisor is assigned to this program.' });
    }
    const advisorId = advisorRes.rows[0].advisor_user_id;
    const result = await db.query(
      `UPDATE student_profiles
       SET assigned_advisor_id = $1
       WHERE degree_code = $2 AND assigned_advisor_id IS NULL
       RETURNING user_id`,
      [advisorId, code]
    );
    res.json({ assigned: result.rowCount });
  } catch (err) {
    console.error('Auto-assign error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/faculty/schedule/:id/approve ────────────────────────────────────
router.put('/schedule/:id/approve', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(
      `UPDATE generated_schedules SET status = 'Official' WHERE schedule_id = $1`,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/faculty/schedule/:id/reject ─────────────────────────────────────
// Returns plan to "Temporary" so the student can revise and resubmit.
router.put('/schedule/:id/reject', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(
      `UPDATE generated_schedules SET status = 'Temporary' WHERE schedule_id = $1`,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// Curriculum management — courses & sections (chairperson use)
// =============================================================================

// GET /programs/:code/courses — all courses in a program with section count
router.get('/programs/:code/courses', async (req, res) => {
    const { code } = req.params;
    try {
        const result = await db.query(`
            SELECT c.course_code, c.title, c.credits, c.description, c.prerequisite_codes,
                   dr.priority_value,
                   COUNT(cs.section_id) FILTER (WHERE cs.deleted_at IS NULL) AS section_count
            FROM degree_requirements dr
            JOIN degree_models dm ON dr.model_id = dm.model_id
            JOIN courses c        ON dr.course_code = c.course_code
            LEFT JOIN course_sections cs ON cs.course_code = c.course_code
            WHERE dm.degree_code = $1 AND dm.is_published = true
              AND dr.deleted_at IS NULL
            GROUP BY c.course_code, c.title, c.credits, c.description,
                     c.prerequisite_codes, dr.priority_value
            ORDER BY dr.priority_value ASC, c.course_code ASC
        `, [code]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch program courses.' });
    }
});

// POST /programs/:code/courses — add (or create) a course and link it to the program
router.post('/programs/:code/courses', async (req, res) => {
    const { code } = req.params;
    const { course_code, title, credits, description, prerequisite_codes } = req.body;

    if (!course_code?.trim() || !title?.trim()) {
        return res.status(400).json({ error: 'course_code and title are required.' });
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        await client.query(`
            INSERT INTO courses (course_code, title, credits, description, prerequisite_codes)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (course_code) DO UPDATE
              SET title = EXCLUDED.title, credits = EXCLUDED.credits,
                  description = EXCLUDED.description,
                  prerequisite_codes = EXCLUDED.prerequisite_codes
        `, [course_code.trim().toUpperCase(), title.trim(), credits || 3,
            description || null, prerequisite_codes || null]);

        const degreeModelRes = await client.query(`
            SELECT model_id FROM degree_models
            WHERE degree_code = $1 AND is_published = true
            ORDER BY version_number DESC LIMIT 1
        `, [code]);

        if (!degreeModelRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No published degree model found for this program.' });
        }
        const { model_id } = degreeModelRes.rows[0];

        const maxRes = await client.query(
            `SELECT COALESCE(MAX(priority_value), 0) AS mx FROM degree_requirements WHERE model_id = $1`,
            [model_id]
        );
        const nextPriority = parseInt(maxRes.rows[0].mx) + 1;

        await client.query(`
            INSERT INTO degree_requirements (model_id, course_code, priority_value)
            VALUES ($1, $2, $3)
            ON CONFLICT ON CONSTRAINT uq_degree_req_model_course DO NOTHING
        `, [model_id, course_code.trim().toUpperCase(), nextPriority]);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to add course.' });
    } finally {
        client.release();
    }
});

// DELETE /programs/:code/courses/:courseCode — remove course from program
router.delete('/programs/:code/courses/:courseCode', async (req, res) => {
    const { code, courseCode } = req.params;
    try {
        await db.query(`
            DELETE FROM degree_requirements
            WHERE course_code = $1
              AND model_id IN (
                  SELECT model_id FROM degree_models
                  WHERE degree_code = $2 AND is_published = true
              )
        `, [courseCode, code]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to remove course from program.' });
    }
});

// PUT /courses/:courseCode — edit course name / description / credits / prereqs
router.put('/courses/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    const { title, credits, description, prerequisite_codes } = req.body;
    try {
        const result = await db.query(`
            UPDATE courses
            SET title              = COALESCE($1, title),
                credits            = COALESCE($2, credits),
                description        = $3,
                prerequisite_codes = $4
            WHERE course_code = $5
            RETURNING *
        `, [title || null, credits ? parseInt(credits) : null,
            description ?? null, prerequisite_codes ?? null, courseCode]);

        if (!result.rows.length) return res.status(404).json({ error: 'Course not found.' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update course.' });
    }
});

// GET /courses/:courseCode/sections
router.get('/courses/:courseCode/sections', async (req, res) => {
    const { courseCode } = req.params;
    try {
        const result = await db.query(`
            SELECT section_id, course_code, section_number, instructor, campus, modality,
                   days, start_time, end_time, term_code, capacity, enrolled
            FROM course_sections
            WHERE course_code = $1 AND deleted_at IS NULL
            ORDER BY term_code ASC NULLS LAST, section_number ASC
        `, [courseCode]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch sections.' });
    }
});

// POST /courses/:courseCode/sections
router.post('/courses/:courseCode/sections', async (req, res) => {
    const { courseCode } = req.params;
    const { section_number, instructor, campus, modality, days,
            start_time, end_time, term_code, capacity, enrolled } = req.body;

    if (!section_number?.trim()) {
        return res.status(400).json({ error: 'section_number is required.' });
    }
    try {
        const result = await db.query(`
            INSERT INTO course_sections
                (course_code, section_number, instructor, campus, modality,
                 days, start_time, end_time, term_code, capacity, enrolled)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING *
        `, [courseCode, section_number.trim(), instructor || null, campus || null,
            modality || null, days || null, start_time || null, end_time || null,
            term_code || null, capacity || 30, enrolled || 0]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create section.' });
    }
});

// PUT /sections/:sectionId
router.put('/sections/:sectionId', async (req, res) => {
    const { sectionId } = req.params;
    const { section_number, instructor, campus, modality, days,
            start_time, end_time, term_code, capacity, enrolled } = req.body;
    try {
        const result = await db.query(`
            UPDATE course_sections
            SET section_number = COALESCE($1, section_number),
                instructor     = $2,
                campus         = $3,
                modality       = $4,
                days           = $5,
                start_time     = $6,
                end_time       = $7,
                term_code      = $8,
                capacity       = COALESCE($9, capacity),
                enrolled       = COALESCE($10, enrolled)
            WHERE section_id = $11 AND deleted_at IS NULL
            RETURNING *
        `, [section_number || null, instructor ?? null, campus ?? null, modality ?? null,
            days ?? null, start_time ?? null, end_time ?? null, term_code ?? null,
            capacity ? parseInt(capacity) : null, enrolled != null ? parseInt(enrolled) : null,
            sectionId]);

        if (!result.rows.length) return res.status(404).json({ error: 'Section not found.' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update section.' });
    }
});

// DELETE /sections/:sectionId — soft delete
router.delete('/sections/:sectionId', async (req, res) => {
    const { sectionId } = req.params;
    try {
        await db.query(
            `UPDATE course_sections SET deleted_at = CURRENT_TIMESTAMP WHERE section_id = $1`,
            [sectionId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete section.' });
    }
});

module.exports = router;
