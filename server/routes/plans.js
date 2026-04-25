// =============================================================================
// server/routes/plans.js
// =============================================================================
const express    = require('express');
const db         = require('../db');
const { createPlan } = require('../algorithm/planAlgorithm');
const router     = express.Router();

// Converts the prerequisite_codes string stored in the DB into the array
// expected by planAlgorithm. New SQL data uses comma-separated AND lists;
// legacy boolean-expression strings are tokenised (course codes only).
function parsePrereqCodes(raw) {
    if (!raw) return [];
    if (!raw.includes(' ') && !raw.includes('(')) {
        return raw.split(',').filter(Boolean);
    }
    const matches = raw.match(/[A-Z]{2,4}\d{3,4}[A-Z]?/g);
    return matches ? [...new Set(matches)] : [];
}

// POST /api/plans/generate/:studentId
// Generates and saves a new degree plan for a student.
router.post('/generate/:studentId', async (req, res) => {
    const studentId = req.params.studentId;
    try {
        // 1. Get student profile — map DB column names to algorithm field names
        const studentRes = await db.query(
            `SELECT user_id AS id,
                    target_credits       AS credits_per_semester,
                    starting_term,
                    (NOT opt_out_summer) AS include_summer,
                    current_degree_model_id
             FROM student_profiles WHERE user_id = $1`,
            [studentId]
        );
        if (!studentRes.rows.length) {
            return res.status(404).json({ error: 'Student not found.' });
        }
        const student = studentRes.rows[0];

        if (!student.current_degree_model_id) {
            return res.status(400).json({ error: 'Student has no degree model assigned. Complete onboarding first.' });
        }

        // 2. Get degree model metadata (total_credits_required)
        const degreeModelRes = await db.query(
            `SELECT total_credits_required FROM degree_models WHERE model_id = $1`,
            [student.current_degree_model_id]
        );
        const degreeModel = degreeModelRes.rows[0] ?? { total_credits_required: null };

        // 3. Get academic history — map course_code to course_id for the algorithm
        const historyRes = await db.query(
            `SELECT course_code FROM academic_history WHERE user_id = $1 AND deleted_at IS NULL`,
            [studentId]
        );
        const completedCourses = historyRes.rows.map(r => ({
            course_id: r.course_code,
            substituting_course_id: null,
        }));

        // 4. Get degree model courses — rename columns to match algorithm expectations
        const modelRes = await db.query(
            `SELECT c.course_code        AS course_id,
                    c.credits,
                    c.corequisite_codes  AS corequisite_code,
                    c.prerequisite_codes,
                    dr.priority_value    AS priority_index
             FROM degree_requirements dr
             JOIN courses c ON dr.course_code = c.course_code
             WHERE dr.model_id = $1 AND dr.deleted_at IS NULL
             ORDER BY dr.priority_value ASC`,
            [student.current_degree_model_id]
        );
        // Only keep prerequisites the algorithm can actually resolve — courses
        // in this degree model or already completed by the student. Prereqs
        // outside this set (e.g. ECET-only courses referenced by COP2800)
        // can never appear in takenIds and would cause a permanent deadlock.
        const knownIds = new Set([
            ...modelRes.rows.map(r => r.course_id),
            ...completedCourses.map(c => c.course_id),
        ]);

        const model = modelRes.rows.map(r => ({
            ...r,
            prerequisites: parsePrereqCodes(r.prerequisite_codes)
                               .filter(p => knownIds.has(p)),
        }));

        if (!model.length) {
            return res.status(400).json({ error: 'Degree model has no courses defined.' });
        }

        // 5. Run the algorithm
        const planEntries = createPlan(completedCourses, model, student, degreeModel);

        if (!planEntries.length) {
            return res.json({ student_id: studentId, semesters_count: 0, plan: [], graduation_term: null });
        }

        const graduationTerm = planEntries[planEntries.length - 1].term_code;

        // 6. Save the plan inside a transaction
        const client = await db.getClient();
        let scheduleId;
        try {
            await client.query('BEGIN');

            // Delete previous plan (schedule_items cascade automatically)
            await client.query(
                `DELETE FROM generated_schedules WHERE student_user_id = $1`,
                [studentId]
            );

            const scheduleRes = await client.query(
                `INSERT INTO generated_schedules (student_user_id, projected_graduation_term, status)
                 VALUES ($1, $2, 'Official') RETURNING schedule_id`,
                [studentId, graduationTerm]
            );
            scheduleId = scheduleRes.rows[0].schedule_id;

            for (const entry of planEntries) {
                // course_id is null for Student Elective rows; store NULL so the
                // semester survives reload from the DB.
                await client.query(
                    `INSERT INTO schedule_items (schedule_id, course_code, semester_year, semester_term)
                     VALUES ($1, $2, $3, $4)`,
                    [scheduleId, entry.course_id, entry.semester_number, entry.term_code]
                );
            }

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        // 6. Return grouped plan
        const plan = groupPlanEntries(planEntries);
        res.json({ student_id: studentId, semesters_count: plan.length, plan, graduation_term: graduationTerm });

    } catch (err) {
        console.error('Plan Generation Error:', err.message);
        res.status(500).json({ error: 'Failed to generate plan.' });
    }
});

// PUT /api/plans/:studentId
// Replaces all schedule items with the student's edited plan.
router.put('/:studentId', async (req, res) => {
    const { studentId } = req.params;
    const { plan } = req.body;
    if (!plan || !Array.isArray(plan)) {
        return res.status(400).json({ error: 'Invalid plan data.' });
    }
    try {
        const schedRes = await db.query(
            `SELECT schedule_id FROM generated_schedules
             WHERE student_user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );
        if (!schedRes.rows.length) return res.status(404).json({ error: 'No plan found to update.' });
        const { schedule_id } = schedRes.rows[0];

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await client.query(`DELETE FROM schedule_items WHERE schedule_id = $1`, [schedule_id]);

            for (const sem of plan) {
                for (const course of sem.courses) {
                    await client.query(
                        `INSERT INTO schedule_items (schedule_id, course_code, semester_year, semester_term)
                         VALUES ($1, $2, $3, $4)`,
                        [schedule_id, course.is_elective ? null : course.course_code, sem.semester, sem.term_code]
                    );
                }
            }

            const lastSem = [...plan].sort((a, b) => b.semester - a.semester)[0];
            if (lastSem) {
                await client.query(
                    `UPDATE generated_schedules SET projected_graduation_term = $1 WHERE schedule_id = $2`,
                    [lastSem.term_code, schedule_id]
                );
            }

            await client.query(
                `INSERT INTO iep_status_history (schedule_id, student_user_id, status, changed_by, notes)
                 VALUES ($1, $2, 'Draft', $2, 'Plan manually edited')`,
                [schedule_id, studentId]
            );
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        const itemsRes = await db.query(
            `SELECT si.course_code, si.semester_year, si.semester_term, c.credits, c.title
             FROM schedule_items si
             LEFT JOIN courses c ON si.course_code = c.course_code
             WHERE si.schedule_id = $1
             ORDER BY si.semester_year`,
            [schedule_id]
        );
        const updatedPlan = groupPlanEntries(itemsRes.rows.map(r => ({
            course_code: r.course_code, semester_number: r.semester_year,
            term_code: r.semester_term, credits: r.credits, title: r.title,
            is_elective: r.course_code === null,
        })));
        const gradRes = await db.query(
            `SELECT projected_graduation_term FROM generated_schedules WHERE schedule_id = $1`,
            [schedule_id]
        );
        res.json({ plan: updatedPlan, graduation_term: gradRes.rows[0]?.projected_graduation_term ?? null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save plan.' });
    }
});

// GET /api/plans/:studentId/status
router.get('/:studentId/status', async (req, res) => {
    const { studentId } = req.params;
    try {
        const schedRes = await db.query(
            `SELECT schedule_id FROM generated_schedules
             WHERE student_user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );
        if (!schedRes.rows.length) {
            return res.json({ current_status: 'Draft', history: [], advisor_notes: null, schedule_id: null });
        }
        const { schedule_id } = schedRes.rows[0];

        const histRes = await db.query(
            `SELECT h.status, h.notes, h.created_at,
                    u.first_name || ' ' || u.last_name AS changed_by_name
             FROM iep_status_history h
             LEFT JOIN users u ON h.changed_by = u.user_id
             WHERE h.schedule_id = $1
             ORDER BY h.created_at DESC`,
            [schedule_id]
        );

        const history = histRes.rows;
        const currentStatus = history.length > 0 ? history[0].status : 'Draft';
        const advisorEntry = history.find(h => ['Approved', 'Declined'].includes(h.status));

        res.json({
            schedule_id,
            current_status:  currentStatus,
            advisor_notes:   advisorEntry?.notes ?? null,
            history,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch IEP status.' });
    }
});

// POST /api/plans/:studentId/submit — student submits plan to advisor
router.post('/:studentId/submit', async (req, res) => {
    const { studentId } = req.params;
    try {
        const schedRes = await db.query(
            `SELECT schedule_id FROM generated_schedules
             WHERE student_user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );
        if (!schedRes.rows.length) return res.status(400).json({ error: 'No plan to submit.' });
        const { schedule_id } = schedRes.rows[0];

        const itemsRes = await db.query(
            `SELECT si.course_code, si.semester_year, si.semester_term, c.title, c.credits
             FROM schedule_items si LEFT JOIN courses c ON si.course_code = c.course_code
             WHERE si.schedule_id = $1 AND si.deleted_at IS NULL`,
            [schedule_id]
        );

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO iep_status_history (schedule_id, student_user_id, status, changed_by)
                 VALUES ($1, $2, 'Submitted', $2)`,
                [schedule_id, studentId]
            );
            await client.query(
                `INSERT INTO iep_snapshots (schedule_id, student_user_id, snapshot_data, status)
                 VALUES ($1, $2, $3, 'Submitted')`,
                [schedule_id, studentId, JSON.stringify(itemsRes.rows)]
            );
            await client.query(
                `UPDATE generated_schedules SET status = 'Pending_Advisor_Review'
                 WHERE student_user_id = $1 AND deleted_at IS NULL`,
                [studentId]
            );
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
        res.json({ success: true, status: 'Submitted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to submit plan.' });
    }
});

// POST /api/plans/:studentId/respond — student accepts or requests revision
router.post('/:studentId/respond', async (req, res) => {
    const { studentId } = req.params;
    const { response } = req.body; // 'accept' | 'revise'
    try {
        const schedRes = await db.query(
            `SELECT schedule_id FROM generated_schedules
             WHERE student_user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );
        if (!schedRes.rows.length) return res.status(400).json({ error: 'No plan found.' });
        const { schedule_id } = schedRes.rows[0];
        const status = response === 'accept' ? 'Accepted' : 'Revised';
        const schedStatus = response === 'accept' ? 'Official' : 'Temporary';
        await db.query(
            `INSERT INTO iep_status_history (schedule_id, student_user_id, status, changed_by)
             VALUES ($1, $2, $3, $2)`,
            [schedule_id, studentId, status]
        );
        await db.query(
            `UPDATE generated_schedules SET status = $1
             WHERE student_user_id = $2 AND deleted_at IS NULL`,
            [schedStatus, studentId]
        );
        res.json({ success: true, status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to record response.' });
    }
});

// POST /api/plans/:studentId/advisor-review — advisor approves or declines
router.post('/:studentId/advisor-review', async (req, res) => {
    const { studentId } = req.params;
    const { decision, notes, advisor_id } = req.body; // 'approve' | 'decline'
    try {
        const schedRes = await db.query(
            `SELECT schedule_id FROM generated_schedules
             WHERE student_user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );
        if (!schedRes.rows.length) return res.status(400).json({ error: 'No plan found.' });
        const { schedule_id } = schedRes.rows[0];
        const status = decision === 'approve' ? 'Approved' : 'Declined';
        const schedStatus = decision === 'approve' ? 'Pending_Student_Acceptance' : 'Temporary';
        await db.query(
            `INSERT INTO iep_status_history (schedule_id, student_user_id, status, changed_by, notes)
             VALUES ($1, $2, $3, $4, $5)`,
            [schedule_id, studentId, status, advisor_id || null, notes || null]
        );
        await db.query(
            `UPDATE generated_schedules SET status = $1
             WHERE student_user_id = $2 AND deleted_at IS NULL`,
            [schedStatus, studentId]
        );
        res.json({ success: true, status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to record advisor review.' });
    }
});

// GET /api/plans/:studentId
// Retrieves the most recently saved plan for a student.
router.get('/:studentId', async (req, res) => {
    const studentId = req.params.studentId;
    try {
        const scheduleRes = await db.query(
            `SELECT schedule_id, projected_graduation_term
             FROM generated_schedules
             WHERE student_user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );

        if (!scheduleRes.rows.length) {
            return res.json({ plan: null, graduation_term: null });
        }

        const { schedule_id, projected_graduation_term } = scheduleRes.rows[0];

        const itemsRes = await db.query(
            `SELECT si.course_code, si.semester_year, si.semester_term, c.credits, c.title
             FROM schedule_items si
             LEFT JOIN courses c ON si.course_code = c.course_code
             WHERE si.schedule_id = $1 AND si.deleted_at IS NULL
             ORDER BY si.semester_year`,
            [schedule_id]
        );

        const rawEntries = itemsRes.rows.map(row => ({
            course_code: row.course_code,
            semester_number: row.semester_year,
            term_code: row.semester_term,
            credits: row.credits,
            title: row.title,
            is_elective: row.course_code === null,
        }));

        const plan = groupPlanEntries(rawEntries);
        res.json({ plan, graduation_term: projected_graduation_term });

    } catch (err) {
        console.error('Get Plan Error:', err.message);
        res.status(500).json({ error: 'Failed to retrieve plan.' });
    }
});

// Groups flat plan entries into semester objects for the frontend.
function groupPlanEntries(entries) {
    const grouped = {};
    for (const entry of entries) {
        const key = entry.semester_number;
        if (!grouped[key]) {
            grouped[key] = { semester: key, term_code: entry.term_code, courses: [] };
        }
        // Algorithm entries use course_id; DB entries use course_code.
        const courseCode = entry.course_code ?? entry.course_id ?? null;
        const isElective = entry.is_elective === true || courseCode === null;
        grouped[key].courses.push({
            course_code: courseCode,
            credits: entry.credits,
            title: entry.title || null,
            is_elective: isElective,
        });
    }
    return Object.values(grouped);
}

module.exports = router;
