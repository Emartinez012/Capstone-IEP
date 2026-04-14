// =============================================================================
// routes/courses.js - Refactored for PostgreSQL
// =============================================================================
const express = require('express');
const db      = require('../db');
const router  = express.Router();

router.get('/', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT course_code, title FROM courses ORDER BY course_code ASC`
        );

        // Map database columns to the format the React frontend expects
        const courses = result.rows.map(row => ({
            id:   row.course_code,
            code: row.course_code,
            name: row.title
        }));

        res.json(courses);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching courses.' });
    }
});

module.exports = router;