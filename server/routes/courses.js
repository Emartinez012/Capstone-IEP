// =============================================================================
// routes/courses.js
// API endpoints for course catalog data.
//
// GET /api/courses   — list all courses in the catalog
// =============================================================================

const express = require('express');
const db      = require('../db');

const router = express.Router();


// -----------------------------------------------------------------------------
// GET /api/courses
// Returns all courses sorted alphabetically by code.
// -----------------------------------------------------------------------------
router.get('/', (req, res) => {
    const courses = db.prepare(`
        SELECT id, code, name
        FROM courses
        ORDER BY code ASC
    `).all();

    res.json(courses);
});


module.exports = router;
