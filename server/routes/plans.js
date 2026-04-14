// =============================================================================
// routes/plans.js
// API endpoints for generating and retrieving student plans.
//
// POST /api/plans/generate/:studentId  — run the algorithm, store and return plan
// GET  /api/plans/:studentId           — retrieve the stored plan for a student
// =============================================================================

const express    = require('express');
const db         = require('../db');
const { createPlan } = require('../algorithm/planAlgorithm');

const router = express.Router();


// -----------------------------------------------------------------------------
// Helper: fetch a stored plan from the database and return it grouped by semester.
//
// Returns an array of semester objects, each with a list of courses:
// [
//   {
//     semester_number: 1,
//     term_code: "241",
//     courses: [
//       { course_id: 2, course_code: "CGS1060C", course_name: "Intro to CS" }
//     ]
//   },
//   ...
// ]
// -----------------------------------------------------------------------------
function getStoredPlan(studentId) {
    const rows = db.prepare(`
        SELECT
            p.semester_number,
            p.term_code,
            p.course_id,
            c.code AS course_code,
            c.name AS course_name
        FROM plans p
        JOIN courses c ON p.course_id = c.id
        WHERE p.student_id = ?
        ORDER BY p.semester_number ASC, c.code ASC
    `).all(studentId);

    // Group the flat rows into semester buckets
    const semesterMap = {};
    for (const row of rows) {
        if (!semesterMap[row.semester_number]) {
            semesterMap[row.semester_number] = {
                semester_number: row.semester_number,
                term_code: row.term_code,
                courses: []
            };
        }
        semesterMap[row.semester_number].courses.push({
            course_id:   row.course_id,
            course_code: row.course_code,
            course_name: row.course_name
        });
    }

    // Convert the map to a sorted array
    return Object.values(semesterMap).sort((a, b) => a.semester_number - b.semester_number);
}


// -----------------------------------------------------------------------------
// POST /api/plans/generate/:studentId
// Runs the scheduling algorithm for the given student, saves the result to the
// database, and returns the grouped plan.
// -----------------------------------------------------------------------------
router.post('/generate/:studentId', (req, res) => {
    const studentId = parseInt(req.params.studentId);

    // 1. Fetch the student record
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    if (!student) {
        return res.status(404).json({ error: 'Student not found.' });
    }

    // 2. Fetch the student's completed courses
    const completedCourses = db.prepare(`
        SELECT course_id, substituting_course_id
        FROM completed_courses
        WHERE student_id = ?
    `).all(studentId);

    // 3. Fetch the program model for the student's major (ordered by priority)
    const modelCourses = db.prepare(`
        SELECT mc.course_id, mc.priority_index, mc.levels
        FROM model_courses mc
        JOIN program_models pm ON mc.model_id = pm.id
        WHERE pm.major_id = ?
        ORDER BY mc.priority_index ASC
    `).all(student.major_id);

    if (modelCourses.length === 0) {
        return res.status(404).json({ error: 'No program model found for this student\'s major.' });
    }

    // 4. Run the core scheduling algorithm
    const planEntries = createPlan(
        completedCourses,
        modelCourses,
        {
            starting_term:        student.starting_term,
            courses_per_semester: student.courses_per_semester
        }
    );

    // 5. Delete any previously generated plan for this student
    db.prepare('DELETE FROM plans WHERE student_id = ?').run(studentId);

    // 6. Save all new plan entries to the database
    const insertPlan = db.prepare(`
        INSERT INTO plans (student_id, course_id, semester_number, term_code, generated_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    db.exec('BEGIN');
    try {
        for (const entry of planEntries) {
            insertPlan.run(studentId, entry.course_id, entry.semester_number, entry.term_code, now);
        }
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        return res.status(500).json({ error: 'Failed to save plan to database.' });
    }

    // 7. Return the full plan grouped by semester
    const plan = getStoredPlan(studentId);
    res.json({
        student_id: studentId,
        semesters_count: plan.length,
        plan
    });
});


// -----------------------------------------------------------------------------
// GET /api/plans/:studentId
// Returns the most recently generated plan for a student (already stored in db).
// Returns 404 if no plan has been generated yet — call POST /generate first.
// -----------------------------------------------------------------------------
router.get('/:studentId', (req, res) => {
    const studentId = parseInt(req.params.studentId);

    const plan = getStoredPlan(studentId);

    if (plan.length === 0) {
        return res.status(404).json({
            error: 'No plan found for this student. Use POST /api/plans/generate/:studentId to create one.'
        });
    }

    res.json({
        student_id: studentId,
        semesters_count: plan.length,
        plan
    });
});


module.exports = router;
