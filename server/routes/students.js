// =============================================================================
// routes/students.js - Refactored for PostgreSQL
// =============================================================================
const express = require('express');
const db      = require('../db');
const router  = express.Router();

router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                sp.user_id AS id, 
                u.first_name, 
                u.last_name, 
                COALESCE(sp.courses_per_semester, 3) AS courses_per_semester, 
                dp.program_name AS major_name,
                (SELECT COUNT(*) FROM generated_schedules gs WHERE gs.student_user_id = sp.user_id) AS has_plan
            FROM student_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            LEFT JOIN degree_programs dp ON sp.degree_code = dp.degree_code
            ORDER BY u.last_name ASC, u.first_name ASC
        `);
        
        const adapted = result.rows.map(r => ({ ...r, has_plan: parseInt(r.has_plan) > 0 ? 1 : 0 }));
        res.json(adapted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching students.' });
    }
});

router.get('/:id', async (req, res) => {
    const studentId = req.params.id;
    try {
        const studentRes = await db.query(`
            SELECT 
                sp.user_id AS id, 
                u.first_name, 
                u.last_name, 
                COALESCE(sp.courses_per_semester, 3) AS courses_per_semester, 
                dp.program_name AS major_name
            FROM student_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            LEFT JOIN degree_programs dp ON sp.degree_code = dp.degree_code
            WHERE sp.user_id = $1
        `, [studentId]);

        if (studentRes.rows.length === 0) return res.status(404).json({ error: 'Student not found.' });
        const student = studentRes.rows[0];

        const historyRes = await db.query(`
            SELECT course_code AS id, course_code AS code, grade 
            FROM academic_history 
            WHERE user_id = $1
        `, [studentId]);
        
        student.completed_courses = historyRes.rows;
        res.json(student);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching student details.' });
    }
});

// -----------------------------------------------------------------------------
// PUT /:id (Matches exact schema columns!)
// -----------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
    const studentId = req.params.id;
    
    // The frontend sends target_credits (from the dropdown), we map it to courses_per_semester
    const { target_credits, degree_code } = req.body;

    try {
        await db.query(`
            UPDATE student_profiles 
            SET courses_per_semester = $1, 
                degree_code = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $3
        `, [target_credits, degree_code, studentId]);

        res.json({ message: 'Student profile updated successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error updating student profile.' });
    }
});

module.exports = router;