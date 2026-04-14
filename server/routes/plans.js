// =============================================================================
// routes/plans.js (PostgreSQL Adapter) - IRONCLAD ARRAY FIX
// =============================================================================
const express    = require('express');
const db         = require('../db');
const { createPlan } = require('../algorithm/planAlgorithm');
const router = express.Router();

async function getStoredPlan(studentId) {
    const result = await db.query(`
        SELECT si.semester_year AS semester_number, si.semester_term AS term_code, si.course_code AS course_id, 
               si.course_code, c.title AS course_name
        FROM schedule_items si
        JOIN generated_schedules gs ON si.schedule_id = gs.schedule_id
        JOIN courses c ON si.course_code = c.course_code
        WHERE gs.student_user_id = $1 AND gs.status = 'Official'
        ORDER BY si.semester_year ASC
    `, [studentId]);

    // Force array
    let rows = [];
    if (result && Array.isArray(result.rows)) rows = result.rows;
    else if (Array.isArray(result)) rows = result;

    const semestersMap = new Map();
    rows.forEach(row => {
        if (!semestersMap.has(row.semester_number)) {
            semestersMap.set(row.semester_number, {
                semester_number: row.semester_number, term_code: row.term_code, courses: []
            });
        }
        semestersMap.get(row.semester_number).courses.push(row);
    });
    return Array.from(semestersMap.values()).sort((a, b) => a.semester_number - b.semester_number);
}

router.post('/generate/:studentId', async (req, res) => {
    const studentId = req.params.studentId;
    try {
        // 1. Get Student Profile
        const studentRes = await db.query(
            'SELECT user_id AS id, courses_per_semester FROM student_profiles WHERE user_id = $1', 
            [studentId]
        );
        let studentProfile = null;
        if (studentRes && Array.isArray(studentRes.rows) && studentRes.rows.length > 0) studentProfile = studentRes.rows[0];
        else if (Array.isArray(studentRes) && studentRes.length > 0) studentProfile = studentRes[0];
        
        if (!studentProfile) return res.status(404).json({ error: 'Student not found.' });

        // 2. Get Academic History (IRONCLAD ARRAY CHECK)
        let historyData = [];
        const historyRes = await db.query('SELECT course_code AS course_id FROM academic_history WHERE user_id = $1', [studentId]);
        if (historyRes && Array.isArray(historyRes.rows)) {
            historyData = historyRes.rows;
        } else if (Array.isArray(historyRes)) {
            historyData = historyRes;
        }
        
        // 3. Get Course Model (IRONCLAD ARRAY CHECK)
        let modelData = [];
        const modelRes = await db.query(`
            SELECT 
                1 AS priority_index, 
                1 AS levels, 
                course_code AS course_id, 
                course_code 
            FROM courses
        `);
        if (modelRes && Array.isArray(modelRes.rows)) {
            modelData = modelRes.rows;
        } else if (Array.isArray(modelRes)) {
            modelData = modelRes;
        }

        // 4. Run the Plan Algorithm (Safely passing guaranteed arrays)
        const planEntries = createPlan(studentProfile, historyData, modelData);
        
        if (!planEntries || !Array.isArray(planEntries) || planEntries.length === 0) {
            return res.json({ student_id: studentId, semesters_count: 0, plan: [] });
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            
            // Delete old schedules safely
            await client.query("DELETE FROM generated_schedules WHERE student_user_id = $1", [studentId]);
            
            // Create new schedule header
            const headerRes = await client.query(
                "INSERT INTO generated_schedules (student_user_id, projected_graduation_term, status) VALUES ($1, '261', 'Official') RETURNING schedule_id",
                [studentId]
            );
            const scheduleId = (headerRes && headerRes.rows) ? headerRes.rows[0].schedule_id : headerRes[0].schedule_id;

            // Insert new schedule items
            for (const entry of planEntries) {
                await client.query(
                    "INSERT INTO schedule_items (schedule_id, course_code, semester_year, semester_term) VALUES ($1, $2, $3, $4)",
                    [scheduleId, entry.course_id, entry.semester_number, entry.term_code || '1']
                );
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err; 
        } finally {
            client.release();
        }

        const plan = await getStoredPlan(studentId);
        res.json({ student_id: studentId, semesters_count: plan.length, plan });
    } catch (err) {
        console.error('Plan Gen Error:', err.message);
        res.status(500).json({ error: 'Failed to generate plan.' });
    }
});

router.get('/:studentId', async (req, res) => {
    try {
        const plan = await getStoredPlan(req.params.studentId);
        if (plan.length === 0) return res.status(404).json({ error: 'No plan found' });
        res.json({ student_id: req.params.studentId, semesters_count: plan.length, plan });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;