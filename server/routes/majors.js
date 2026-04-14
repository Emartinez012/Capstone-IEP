// =============================================================================
// routes/majors.js (PostgreSQL Adapter)
// =============================================================================
const express = require('express');
const db      = require('../db');
const router  = express.Router();

router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT degree_code AS id, program_name AS name 
            FROM degree_programs 
            ORDER BY program_name ASC
        `);
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
        const modelCourses = await db.query(`
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
        
        res.json(modelCourses.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching program model.' });
    }
});

module.exports = router;