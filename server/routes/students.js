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

// PUT /:id — saves all onboarding fields and resolves current_degree_model_id
router.put('/:id', async (req, res) => {
    const studentId = req.params.id;
    const {
        target_credits,
        degree_code,
        starting_term,
        opt_out_summer,
        is_transfer,
        completed_courses,
        preferred_modality,
        preferred_campus_location,
        preferred_time_slot,
        preferred_term_durations,
    } = req.body;

    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        // Resolve the published degree model for the chosen program
        const modelRes = await client.query(
            `SELECT model_id FROM degree_models
             WHERE degree_code = $1 AND is_published = true
             ORDER BY version_number DESC LIMIT 1`,
            [degree_code]
        );
        const modelId = modelRes.rows[0]?.model_id || null;

        await client.query(`
            UPDATE student_profiles
            SET target_credits            = $1,
                courses_per_semester      = $2,
                degree_code               = $3,
                current_degree_model_id   = $4,
                starting_term             = $5,
                opt_out_summer            = $6,
                is_transfer               = $7,
                preferred_modality        = $8,
                preferred_campus_location = $9,
                preferred_time_slot       = $10,
                preferred_term_durations  = $11,
                updated_at                = CURRENT_TIMESTAMP
            WHERE user_id = $12
        `, [
            target_credits,
            Math.round(target_credits / 3),
            degree_code,
            modelId,
            starting_term,
            opt_out_summer            ?? false,
            is_transfer               ?? false,
            JSON.stringify(preferred_modality        || []),
            preferred_campus_location || '',
            JSON.stringify(preferred_time_slot       || { blocks: [], pattern: '' }),
            JSON.stringify(preferred_term_durations  || [16]),
            studentId,
        ]);

        // For transfer students, replace academic history with transferred courses
        if (is_transfer && Array.isArray(completed_courses) && completed_courses.length > 0) {
            await client.query('DELETE FROM academic_history WHERE user_id = $1', [studentId]);
            for (const courseCode of completed_courses) {
                await client.query(
                    `INSERT INTO academic_history (user_id, course_code, grade) VALUES ($1, $2, 'TR')`,
                    [studentId, courseCode]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Student profile updated successfully.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Database error updating student profile.' });
    } finally {
        client.release();
    }
});

module.exports = router;