// =============================================================================
// routes/majors.js (PostgreSQL Adapter)
// =============================================================================
const express = require('express');
const db      = require('../db');
const router  = express.Router();

// Programs with fewer than this many program_model_row entries are treated as
// stale/legacy snapshots and hidden from the onboarding picker. Tweak here if
// a niche program legitimately has fewer rows.
const MIN_MODEL_ROWS_FOR_PUBLIC = 20;

router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT dp.degree_code AS id, dp.program_name AS name
            FROM degree_programs dp
            JOIN program_model pm
              ON pm.program_id = dp.degree_code AND pm.is_active = true
            JOIN program_model_row pmr
              ON pmr.program_model_id = pm.id
            GROUP BY dp.degree_code, dp.program_name
            HAVING COUNT(pmr.id) >= $1
            ORDER BY dp.program_name ASC
        `, [MIN_MODEL_ROWS_FOR_PUBLIC]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching majors.' });
    }
});

router.get('/:id/model', async (req, res) => {
    const degreeCode = req.params.id;

    try {
        // Fixed: Joined degree_requirements to fetch priorities and levels
        const degreeModelCourses = await db.query(`
            SELECT
                dr.priority_value AS priority_index,
                COALESCE(rl.level_value, 1) AS levels,
                c.course_code AS course_id,
                c.course_code,
                c.title AS course_name
            FROM degree_models dm
            JOIN degree_requirements dr ON dm.model_id = dr.model_id
            JOIN courses c ON dr.course_code = c.course_code
            LEFT JOIN requirement_levels rl ON dr.requirement_id = rl.requirement_id
            WHERE dm.degree_code = $1
            ORDER BY dr.priority_value ASC
        `, [degreeCode]);

        res.json(degreeModelCourses.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching degree model courses.' });
    }
});

module.exports = router;