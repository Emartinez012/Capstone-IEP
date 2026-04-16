// =============================================================================
// server/routes/plans.js
// =============================================================================
const express    = require('express');
const db         = require('../db');
const { createPlan } = require('../algorithm/planAlgorithm');
const router     = express.Router();

// POST /api/plans/generate/:studentId
// Generates and saves a new degree plan for a student.
router.post('/generate/:studentId', async (req, res) => {
    const studentId = req.params.studentId;
    try {
        // 1. Get student profile (needs current_degree_model_id and starting_term)
        const studentRes = await db.query(
            `SELECT user_id AS id, target_credits, starting_term, opt_out_summer, current_degree_model_id
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

        // 2. Get academic history
        const historyRes = await db.query(
            `SELECT course_code FROM academic_history WHERE user_id = $1 AND deleted_at IS NULL`,
            [studentId]
        );
        const history = historyRes.rows;

        // 3. Get degree model courses with prerequisites and priority
        const modelRes = await db.query(
            `SELECT c.course_code, c.credits, c.prerequisite_codes, dr.priority_value
             FROM degree_requirements dr
             JOIN courses c ON dr.course_code = c.course_code
             WHERE dr.model_id = $1 AND dr.deleted_at IS NULL
             ORDER BY dr.priority_value ASC`,
            [student.current_degree_model_id]
        );
        const model = modelRes.rows;

        if (!model.length) {
            return res.status(400).json({ error: 'Degree model has no courses defined.' });
        }

        // 4. Run the algorithm
        const planEntries = createPlan(student, history, model);

        if (!planEntries.length) {
            return res.json({ student_id: studentId, semesters_count: 0, plan: [], graduation_term: null });
        }

        const graduationTerm = planEntries[planEntries.length - 1].term_code;

        // 5. Save the plan inside a transaction
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
                await client.query(
                    `INSERT INTO schedule_items (schedule_id, course_code, semester_year, semester_term)
                     VALUES ($1, $2, $3, $4)`,
                    [scheduleId, entry.course_code, entry.semester_number, entry.term_code]
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
             JOIN courses c ON si.course_code = c.course_code
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
        grouped[key].courses.push({
            course_code: entry.course_code,
            credits: entry.credits,
            title: entry.title || null,
        });
    }
    return Object.values(grouped);
}

module.exports = router;
