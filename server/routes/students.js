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
        secondary_campus_location,
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
            SET target_credits              = $1,
                courses_per_semester        = $2,
                degree_code                 = $3,
                current_degree_model_id     = $4,
                starting_term               = $5,
                opt_out_summer              = $6,
                is_transfer                 = $7,
                preferred_modality          = $8,
                preferred_campus_location   = $9,
                secondary_campus_location   = $10,
                preferred_time_slot         = $11,
                preferred_term_durations    = $12,
                updated_at                  = CURRENT_TIMESTAMP
            WHERE user_id = $13
        `, [
            target_credits,
            Math.round(target_credits / 3),
            degree_code,
            modelId,
            starting_term,
            opt_out_summer                ?? false,
            is_transfer                   ?? false,
            JSON.stringify(preferred_modality        || []),
            preferred_campus_location     || '',
            secondary_campus_location     || null,
            JSON.stringify(preferred_time_slot       || { blocks: [], pattern: '' }),
            JSON.stringify(preferred_term_durations  || [16]),
            studentId,
        ]);

        // Auto-assign advisor based on the chosen program (only if not already assigned)
        if (degree_code) {
            const advisorRes = await client.query(
                `SELECT advisor_user_id
                 FROM advisor_program_assignments
                 WHERE degree_code = $1
                 LIMIT 1`,
                [degree_code]
            );
            if (advisorRes.rows.length > 0) {
                await client.query(
                    `UPDATE student_profiles
                     SET assigned_advisor_id = $1
                     WHERE user_id = $2 AND assigned_advisor_id IS NULL`,
                    [advisorRes.rows[0].advisor_user_id, studentId]
                );
            }
        }

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

// GET /:id/profile — full student profile with advisor info and course history
router.get('/:id/profile', async (req, res) => {
    const studentId = req.params.id;
    try {
        const result = await db.query(`
            SELECT
                sp.user_id          AS id,
                u.first_name,
                u.last_name,
                u.email,
                sp.student_id,
                sp.degree_code,
                dp.program_name     AS major_name,
                sp.target_credits,
                sp.opt_out_summer,
                sp.is_transfer,
                sp.preferred_modality,
                sp.preferred_campus_location,
                sp.secondary_campus_location,
                sp.preferred_time_slot,
                sp.preferred_term_durations,
                sp.starting_term,
                sp.assigned_advisor_id,
                au.first_name       AS advisor_first_name,
                au.last_name        AS advisor_last_name,
                au.email            AS advisor_email
            FROM student_profiles sp
            JOIN users u             ON sp.user_id           = u.user_id
            LEFT JOIN degree_programs dp ON sp.degree_code   = dp.degree_code
            LEFT JOIN users au       ON sp.assigned_advisor_id = au.user_id
            WHERE sp.user_id = $1
        `, [studentId]);

        if (!result.rows.length) return res.status(404).json({ error: 'Student not found.' });

        const row = result.rows[0];

        const historyRes = await db.query(`
            SELECT ah.course_code, c.title, c.credits, ah.grade
            FROM academic_history ah
            LEFT JOIN courses c ON ah.course_code = c.course_code
            WHERE ah.user_id = $1 AND ah.deleted_at IS NULL
            ORDER BY ah.course_code
        `, [studentId]);

        // Calculate GPA from academic_history. W and TR grades are excluded.
        const GPA_POINTS = {
            'A+': 4.0, 'A': 4.0, 'A-': 3.7,
            'B+': 3.3, 'B': 3.0, 'B-': 2.7,
            'C+': 2.3, 'C': 2.0, 'C-': 1.7,
            'D+': 1.3, 'D': 1.0, 'D-': 0.7,
            'F':  0.0,
        };
        const gpaRows = historyRes.rows.filter(c => GPA_POINTS[c.grade] !== undefined);
        const gpa = gpaRows.length === 0 ? null : (() => {
            const totalPts = gpaRows.reduce((s, c) => s + GPA_POINTS[c.grade] * (c.credits || 3), 0);
            const totalCr  = gpaRows.reduce((s, c) => s + (c.credits || 3), 0);
            return totalCr > 0 ? Math.round(totalPts / totalCr * 100) / 100 : null;
        })();

        res.json({
            id:                         row.id,
            first_name:                 row.first_name,
            last_name:                  row.last_name,
            email:                      row.email,
            student_id:                 row.student_id,
            degree_code:                row.degree_code,
            major_name:                 row.major_name,
            target_credits:             row.target_credits,
            gpa,
            opt_out_summer:             row.opt_out_summer,
            is_transfer:                row.is_transfer,
            preferred_modality:         row.preferred_modality         || [],
            preferred_campus_location:  row.preferred_campus_location  || '',
            secondary_campus_location:  row.secondary_campus_location  || null,
            preferred_time_slot:        row.preferred_time_slot        || { blocks: [], pattern: '' },
            preferred_term_durations:   row.preferred_term_durations   || [16],
            starting_term:              row.starting_term,
            advisor: row.assigned_advisor_id ? {
                id:         row.assigned_advisor_id,
                first_name: row.advisor_first_name,
                last_name:  row.advisor_last_name,
                email:      row.advisor_email,
            } : null,
            academic_history: historyRes.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching profile.' });
    }
});

module.exports = router;