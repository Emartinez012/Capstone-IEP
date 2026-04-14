// =============================================================================
// routes/students.js
// API endpoints for student data.
//
// GET /api/students        — list all students (with major name)
// GET /api/students/:id    — one student + their completed courses
// =============================================================================

const express = require('express');
const db      = require('../db');

const router = express.Router();


// -----------------------------------------------------------------------------
// GET /api/students
// Returns every student with their major name, sorted alphabetically.
// -----------------------------------------------------------------------------
router.get('/', (req, res) => {
    const students = db.prepare(`
        SELECT
            s.id,
            s.first_name,
            s.last_name,
            s.starting_term,
            s.courses_per_semester,
            m.name AS major_name,
            CASE WHEN EXISTS (SELECT 1 FROM plans WHERE student_id = s.id) THEN 1 ELSE 0 END AS has_plan
        FROM students s
        JOIN majors m ON s.major_id = m.id
        ORDER BY s.last_name ASC, s.first_name ASC
    `).all();

    res.json(students);
});


// -----------------------------------------------------------------------------
// GET /api/students/:id
// Returns one student record plus the list of courses they have completed.
// -----------------------------------------------------------------------------
router.get('/:id', (req, res) => {
    const studentId = parseInt(req.params.id);

    // Fetch the student record
    const student = db.prepare(`
        SELECT
            s.id,
            s.first_name,
            s.last_name,
            s.starting_term,
            s.courses_per_semester,
            s.major_id,
            m.name AS major_name
        FROM students s
        JOIN majors m ON s.major_id = m.id
        WHERE s.id = ?
    `).get(studentId);

    if (!student) {
        return res.status(404).json({ error: 'Student not found.' });
    }

    // Fetch their completed courses
    const completed = db.prepare(`
        SELECT
            cc.id,
            cc.course_id,
            c.code  AS course_code,
            c.name  AS course_name,
            cc.grade
        FROM completed_courses cc
        JOIN courses c ON cc.course_id = c.id
        WHERE cc.student_id = ?
        ORDER BY c.code ASC
    `).all(studentId);

    res.json({ ...student, completed_courses: completed });
});


// -----------------------------------------------------------------------------
// PUT /api/students/:id/profile
// Updates a student's preferences and profile data.
// -----------------------------------------------------------------------------
router.put('/:id/profile', (req, res) => {
    const studentId = parseInt(req.params.id);
    const {
        major_id, starting_term, courses_per_semester,
        delivery_mode, preferred_days, preferred_times,
        skipped_terms, career_goal, transfer_goals
    } = req.body;

    try {
        const update = db.prepare(`
            UPDATE students SET
                major_id = ?,
                starting_term = ?,
                courses_per_semester = ?,
                delivery_mode = ?,
                preferred_days = ?,
                preferred_times = ?,
                skipped_terms = ?,
                career_goal = ?,
                transfer_goals = ?
            WHERE id = ?
        `);

        update.run(
            major_id, starting_term, courses_per_semester,
            delivery_mode, JSON.stringify(preferred_days),
            JSON.stringify(preferred_times), JSON.stringify(skipped_terms),
            career_goal, transfer_goals, studentId
        );

        res.json({ message: 'Profile updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Database error while updating profile.' });
    }
});


// -----------------------------------------------------------------------------
// POST /api/students/:id/parse-transcript
// Accepts raw text from a transcript and extracts course codes.
// -----------------------------------------------------------------------------
router.post('/:id/parse-transcript', (req, res) => {
    const studentId = parseInt(req.params.id);
    const { text } = req.body;

    if (!text) return res.status(400).json({ error: 'No transcript text provided.' });

    try {
        // 1. Get all courses from the database
        const allCourses = db.prepare('SELECT id, code FROM courses').all();

        // 2. Scan text for matching course codes
        const foundCourses = [];
        allCourses.forEach(course => {
            // Regex to find course code as a whole word (e.g., \bCAI1001C\b)
            const regex = new RegExp(`\\b${course.code}\\b`, 'gi');
            if (regex.test(text)) {
                foundCourses.push(course);
            }
        });

        if (foundCourses.length === 0) {
            return res.json({ message: 'No recognizable courses found in the text.', count: 0 });
        }

        // 3. Clear existing completed courses and insert new ones (re-calculating transcript)
        db.exec('BEGIN');
        try {
            db.prepare('DELETE FROM completed_courses WHERE student_id = ?').run(studentId);
            const insert = db.prepare('INSERT INTO completed_courses (student_id, course_id, grade) VALUES (?, ?, "P")');

            foundCourses.forEach(course => {
                insert.run(studentId, course.id);
            });
            db.exec('COMMIT');
        } catch (err) {
            db.exec('ROLLBACK');
            throw err;
        }

        res.json({
            message: `Successfully extracted ${foundCourses.length} courses.`,
            courses: foundCourses.map(c => c.code),
            count: foundCourses.length
        });
    } catch (err) {
        res.status(500).json({ error: 'Error processing transcript.' });
    }
});


module.exports = router;
