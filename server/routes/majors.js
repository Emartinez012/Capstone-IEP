// =============================================================================
// routes/majors.js
// API endpoints for degree programs and their course models.
//
// GET /api/majors              — list all majors
// GET /api/majors/:id/model    — get the program model for a major (with courses)
// =============================================================================

const express = require('express');
const db      = require('../db');

const router = express.Router();


// -----------------------------------------------------------------------------
// GET /api/majors
// Returns all degree programs.
// -----------------------------------------------------------------------------
router.get('/', (req, res) => {
    const majors = db.prepare(`
        SELECT id, name FROM majors ORDER BY name ASC
    `).all();

    res.json(majors);
});


// -----------------------------------------------------------------------------
// GET /api/majors/:id/model
// Returns the program model for a given major — all required courses in
// priority order, with their level data.
// -----------------------------------------------------------------------------
router.get('/:id/model', (req, res) => {
    const majorId = parseInt(req.params.id);

    const major = db.prepare('SELECT id, name FROM majors WHERE id = ?').get(majorId);
    if (!major) {
        return res.status(404).json({ error: 'Major not found.' });
    }

    const modelCourses = db.prepare(`
        SELECT
            mc.priority_index,
            mc.levels,
            c.id   AS course_id,
            c.code AS course_code,
            c.name AS course_name
        FROM model_courses mc
        JOIN program_models pm ON mc.model_id = pm.id
        JOIN courses c         ON mc.course_id = c.id
        WHERE pm.major_id = ?
        ORDER BY mc.priority_index ASC
    `).all(majorId);

    res.json({
        major_id:   major.id,
        major_name: major.name,
        courses:    modelCourses
    });
});


module.exports = router;
