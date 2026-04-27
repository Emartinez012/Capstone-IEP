// =============================================================================
// server/routes/plans.js
// =============================================================================
const express    = require('express');
const db         = require('../db');
const { createPlan }  = require('../algorithm/planAlgorithm');
const iepGenerator    = require('../services/IEPGeneratorService');
const { buildKnownPrereqIds, filterPrereqsAndCollectDrops } = require('../services/prereqFilter');
const router     = express.Router();

// Converts the prerequisite_codes string stored in the DB into the array
// expected by planAlgorithm. New SQL data uses comma-separated AND lists;
// legacy boolean-expression strings are tokenised (course codes only).
function parsePrereqCodes(raw) {
    if (!raw) return [];
    if (!raw.includes(' ') && !raw.includes('(')) {
        return raw.split(',').filter(Boolean);
    }
    const matches = raw.match(/[A-Z]{2,4}\d{3,4}[A-Z]?/g);
    return matches ? [...new Set(matches)] : [];
}

// POST /api/plans/generate/:studentId
// Generates and saves a new degree plan for a student.
router.post('/generate/:studentId', async (req, res) => {
    const studentId = req.params.studentId;
    try {
        // 1. Get student profile — map DB column names to algorithm field names
        const studentRes = await db.query(
            `SELECT user_id AS id,
                    target_credits       AS credits_per_semester,
                    starting_term,
                    (NOT opt_out_summer) AS include_summer,
                    takes_summer,
                    target_courses_fall_spring,
                    target_credits_fall_spring,
                    target_courses_summer,
                    target_credits_summer,
                    current_degree_model_id,
                    selected_program_model_id
             FROM student_profiles WHERE user_id = $1`,
            [studentId]
        );
        if (!studentRes.rows.length) {
            return res.status(404).json({ error: 'Student not found.' });
        }
        const student = studentRes.rows[0];

        // Phase 6 path — IEPGeneratorService when the student is wired to a program_model.
        if (student.selected_program_model_id) {
            return await generateWithIEPService(studentId, student, res);
        }

        if (!student.current_degree_model_id) {
            return res.status(400).json({ error: 'Student has no degree model assigned. Complete onboarding first.' });
        }

        // 2. Get degree model metadata (total_credits_required)
        const degreeModelRes = await db.query(
            `SELECT total_credits_required FROM degree_models WHERE model_id = $1`,
            [student.current_degree_model_id]
        );
        const degreeModel = degreeModelRes.rows[0] ?? { total_credits_required: null };

        // 3. Get academic history — map course_code to course_id for the algorithm
        const historyRes = await db.query(
            `SELECT course_code FROM academic_history WHERE user_id = $1 AND deleted_at IS NULL`,
            [studentId]
        );
        const completedCourses = historyRes.rows.map(r => ({
            course_id: r.course_code,
            substituting_course_id: null,
        }));

        // 4. Get degree model courses — rename columns to match algorithm expectations
        const degreeModelCoursesRes = await db.query(
            `SELECT c.course_code        AS course_id,
                    c.credits,
                    c.corequisite_codes  AS corequisite_code,
                    c.prerequisite_codes,
                    dr.priority_value    AS priority_index
             FROM degree_requirements dr
             JOIN courses c ON dr.course_code = c.course_code
             WHERE dr.model_id = $1 AND dr.deleted_at IS NULL
             ORDER BY dr.priority_value ASC`,
            [student.current_degree_model_id]
        );
        // Only keep prerequisites the algorithm can actually resolve — courses
        // in this degree model or already completed by the student. Prereqs
        // outside this set (e.g. ECET-only courses referenced by COP2800)
        // can never appear in takenIds and would cause a permanent deadlock.
        const knownIds = new Set([
            ...degreeModelCoursesRes.rows.map(r => r.course_id),
            ...completedCourses.map(c => c.course_id),
        ]);

        const degreeModelCourses = degreeModelCoursesRes.rows.map(r => ({
            ...r,
            prerequisites: parsePrereqCodes(r.prerequisite_codes)
                               .filter(p => knownIds.has(p)),
        }));

        if (!degreeModelCourses.length) {
            return res.status(400).json({ error: 'Degree model has no courses defined.' });
        }

        // 5. Run the algorithm
        const planEntries = createPlan(completedCourses, degreeModelCourses, student, degreeModel);

        if (!planEntries.length) {
            return res.json({ student_id: studentId, semesters_count: 0, plan: [], graduation_term: null });
        }

        const graduationTerm = planEntries[planEntries.length - 1].term_code;

        // 6. Save the plan inside a transaction
        const client = await db.getClient();
        let scheduleId;
        try {
            await client.query('BEGIN');

            // Delete previous plan (schedule_items cascade automatically)
            await client.query(
                `DELETE FROM generated_schedules WHERE student_user_id = $1`,
                [studentId]
            );

            const scheduleRes = await client.query(
                `INSERT INTO generated_schedules (student_user_id, projected_graduation_term, status)
                 VALUES ($1, $2, 'Official') RETURNING schedule_id`,
                [studentId, graduationTerm]
            );
            scheduleId = scheduleRes.rows[0].schedule_id;

            for (const entry of planEntries) {
                // course_id is null for Student Elective rows; store NULL so the
                // semester survives reload from the DB.
                await client.query(
                    `INSERT INTO schedule_items (schedule_id, course_code, semester_year, semester_term)
                     VALUES ($1, $2, $3, $4)`,
                    [scheduleId, entry.course_id, entry.semester_number, entry.term_code]
                );
            }

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        // 6. Return grouped plan
        const plan = groupPlanEntries(planEntries);
        res.json({ student_id: studentId, semesters_count: plan.length, plan, graduation_term: graduationTerm });

    } catch (err) {
        console.error('Plan Generation Error:', err.message);
        res.status(500).json({ error: 'Failed to generate plan.' });
    }
});

// PUT /api/plans/:studentId
// Replaces all schedule items with the student's edited plan.
router.put('/:studentId', async (req, res) => {
    const { studentId } = req.params;
    const { plan } = req.body;
    if (!plan || !Array.isArray(plan)) {
        return res.status(400).json({ error: 'Invalid plan data.' });
    }
    try {
        const schedRes = await db.query(
            `SELECT schedule_id FROM generated_schedules
             WHERE student_user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );
        if (!schedRes.rows.length) return res.status(404).json({ error: 'No plan found to update.' });
        const { schedule_id } = schedRes.rows[0];

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await client.query(`DELETE FROM schedule_items WHERE schedule_id = $1`, [schedule_id]);

            for (const sem of plan) {
                for (const course of sem.courses) {
                    await client.query(
                        `INSERT INTO schedule_items (schedule_id, course_code, semester_year, semester_term)
                         VALUES ($1, $2, $3, $4)`,
                        [schedule_id, course.is_elective ? null : course.course_code, sem.semester, sem.term_code]
                    );
                }
            }

            const lastSem = [...plan].sort((a, b) => b.semester - a.semester)[0];
            if (lastSem) {
                await client.query(
                    `UPDATE generated_schedules SET projected_graduation_term = $1 WHERE schedule_id = $2`,
                    [lastSem.term_code, schedule_id]
                );
            }

            await client.query(
                `INSERT INTO iep_status_history (schedule_id, student_user_id, status, changed_by, notes)
                 VALUES ($1, $2, 'Draft', $2, 'Plan manually edited')`,
                [schedule_id, studentId]
            );
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        const itemsRes = await db.query(
            `SELECT si.course_code, si.semester_year, si.semester_term, c.credits, c.title
             FROM schedule_items si
             LEFT JOIN courses c ON si.course_code = c.course_code
             WHERE si.schedule_id = $1
             ORDER BY si.semester_year`,
            [schedule_id]
        );
        const updatedPlan = groupPlanEntries(itemsRes.rows.map(r => ({
            course_code: r.course_code, semester_number: r.semester_year,
            term_code: r.semester_term, credits: r.credits, title: r.title,
            is_elective: r.course_code === null,
        })));
        const gradRes = await db.query(
            `SELECT projected_graduation_term FROM generated_schedules WHERE schedule_id = $1`,
            [schedule_id]
        );
        res.json({ plan: updatedPlan, graduation_term: gradRes.rows[0]?.projected_graduation_term ?? null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save plan.' });
    }
});

// PATCH /api/plans/:studentId/electives
// Records a student's elective override for a single program-model row.
// Body: { source_row_id: UUID, course_id: VARCHAR }
// Validates the choice against the row's allowed_course_ids and (if not the
// default) marks resolution_source = 'elective_chosen'.
router.patch('/:studentId/electives', async (req, res) => {
    const { studentId } = req.params;
    const { source_row_id, course_id } = req.body || {};

    if (!source_row_id || !course_id) {
        return res.status(400).json({ error: 'source_row_id and course_id are required.' });
    }

    try {
        // Validate the row exists, is an elective, and the chosen course is allowed.
        const rowRes = await db.query(
            `SELECT id, is_elective, default_course_id, allowed_course_ids
             FROM program_model_row WHERE id = $1`,
            [source_row_id]
        );
        if (!rowRes.rows.length) {
            return res.status(404).json({ error: 'Program model row not found.' });
        }
        const row = rowRes.rows[0];
        if (!row.is_elective) {
            return res.status(400).json({ error: 'Row is not an elective slot.' });
        }
        const allowed = row.allowed_course_ids || [];
        if (!allowed.includes(course_id)) {
            return res.status(400).json({ error: 'course_id is not in this row\'s allowed_course_ids.' });
        }

        // Find the active schedule_item for this student + row.
        const itemRes = await db.query(
            `SELECT si.item_id
             FROM schedule_items si
             JOIN generated_schedules gs ON gs.schedule_id = si.schedule_id
             WHERE gs.student_user_id = $1
               AND si.source_row_id   = $2
               AND si.deleted_at IS NULL
               AND gs.deleted_at IS NULL
             ORDER BY si.semester_year DESC LIMIT 1`,
            [studentId, source_row_id]
        );
        if (!itemRes.rows.length) {
            return res.status(404).json({ error: 'No matching schedule item for this student + row.' });
        }
        const { item_id } = itemRes.rows[0];

        const newResolution = (course_id === row.default_course_id)
            ? 'elective_default'
            : 'elective_chosen';

        await db.query(
            `UPDATE schedule_items
             SET course_code = $1,
                 resolution_source = $2
             WHERE item_id = $3`,
            [course_id, newResolution, item_id]
        );

        return res.json({
            item_id,
            course_id,
            resolution_source:   newResolution,
            is_student_override: newResolution === 'elective_chosen',
        });
    } catch (err) {
        console.error('Elective override error:', err);
        res.status(500).json({ error: 'Failed to record elective override.' });
    }
});

// POST /api/plans/:studentId/resolve-slot
// Advisor fills an unresolved slot with a chosen course code. The advisor's
// review note is appended to iep_status_history for audit. Body:
// { source_row_id: UUID, course_id: VARCHAR, advisor_id?: UUID, notes?: TEXT }
router.post('/:studentId/resolve-slot', async (req, res) => {
    const { studentId } = req.params;
    const { source_row_id, course_id, advisor_id, notes } = req.body || {};

    if (!source_row_id || !course_id) {
        return res.status(400).json({ error: 'source_row_id and course_id are required.' });
    }

    try {
        // Confirm course exists.
        const courseRes = await db.query(
            `SELECT credits FROM courses WHERE course_code = $1 AND deleted_at IS NULL`,
            [course_id]
        );
        if (!courseRes.rows.length) {
            return res.status(400).json({ error: `Course ${course_id} not found.` });
        }

        // Find the unresolved schedule_item.
        const itemRes = await db.query(
            `SELECT si.item_id, si.schedule_id
             FROM schedule_items si
             JOIN generated_schedules gs ON gs.schedule_id = si.schedule_id
             WHERE gs.student_user_id = $1
               AND si.source_row_id   = $2
               AND si.resolution_source = 'unresolved'
               AND si.deleted_at IS NULL
             ORDER BY si.semester_year DESC LIMIT 1`,
            [studentId, source_row_id]
        );
        if (!itemRes.rows.length) {
            return res.status(404).json({ error: 'No unresolved slot found for this student + row.' });
        }
        const { item_id, schedule_id } = itemRes.rows[0];

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE schedule_items
                 SET course_code = $1,
                     resolution_source = 'advisor_resolved',
                     reason = NULL
                 WHERE item_id = $2`,
                [course_id, item_id]
            );
            await client.query(
                `INSERT INTO iep_status_history (schedule_id, student_user_id, status, changed_by, notes)
                 VALUES ($1, $2, 'Advisor_Resolved_Slot', $3, $4)`,
                [schedule_id, studentId, advisor_id || null,
                 notes || `Resolved unresolved slot with ${course_id}`]
            );
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        return res.json({
            item_id,
            course_id,
            resolution_source: 'advisor_resolved',
        });
    } catch (err) {
        console.error('Resolve-slot error:', err);
        res.status(500).json({ error: 'Failed to resolve slot.' });
    }
});

// GET /api/plans/:studentId/status
router.get('/:studentId/status', async (req, res) => {
    const { studentId } = req.params;
    try {
        const schedRes = await db.query(
            `SELECT schedule_id FROM generated_schedules
             WHERE student_user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );
        if (!schedRes.rows.length) {
            return res.json({ current_status: 'Draft', history: [], advisor_notes: null, schedule_id: null });
        }
        const { schedule_id } = schedRes.rows[0];

        const histRes = await db.query(
            `SELECT h.status, h.notes, h.created_at,
                    u.first_name || ' ' || u.last_name AS changed_by_name
             FROM iep_status_history h
             LEFT JOIN users u ON h.changed_by = u.user_id
             WHERE h.schedule_id = $1
             ORDER BY h.created_at DESC`,
            [schedule_id]
        );

        const history = histRes.rows;
        const currentStatus = history.length > 0 ? history[0].status : 'Draft';
        const advisorEntry = history.find(h => ['Approved', 'Declined'].includes(h.status));

        res.json({
            schedule_id,
            current_status:  currentStatus,
            advisor_notes:   advisorEntry?.notes ?? null,
            history,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch IEP status.' });
    }
});

// POST /api/plans/:studentId/submit — student submits plan to advisor
router.post('/:studentId/submit', async (req, res) => {
    const { studentId } = req.params;
    try {
        const schedRes = await db.query(
            `SELECT schedule_id FROM generated_schedules
             WHERE student_user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );
        if (!schedRes.rows.length) return res.status(400).json({ error: 'No plan to submit.' });
        const { schedule_id } = schedRes.rows[0];

        const itemsRes = await db.query(
            `SELECT si.course_code, si.semester_year, si.semester_term, c.title, c.credits
             FROM schedule_items si LEFT JOIN courses c ON si.course_code = c.course_code
             WHERE si.schedule_id = $1 AND si.deleted_at IS NULL`,
            [schedule_id]
        );

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO iep_status_history (schedule_id, student_user_id, status, changed_by)
                 VALUES ($1, $2, 'Submitted', $2)`,
                [schedule_id, studentId]
            );
            await client.query(
                `INSERT INTO iep_snapshots (schedule_id, student_user_id, snapshot_data, status)
                 VALUES ($1, $2, $3, 'Submitted')`,
                [schedule_id, studentId, JSON.stringify(itemsRes.rows)]
            );
            await client.query(
                `UPDATE generated_schedules SET status = 'Pending_Advisor_Review'
                 WHERE student_user_id = $1 AND deleted_at IS NULL`,
                [studentId]
            );
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
        res.json({ success: true, status: 'Submitted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to submit plan.' });
    }
});

// POST /api/plans/:studentId/respond — student accepts or requests revision
router.post('/:studentId/respond', async (req, res) => {
    const { studentId } = req.params;
    const { response } = req.body; // 'accept' | 'revise'
    try {
        const schedRes = await db.query(
            `SELECT schedule_id FROM generated_schedules
             WHERE student_user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );
        if (!schedRes.rows.length) return res.status(400).json({ error: 'No plan found.' });
        const { schedule_id } = schedRes.rows[0];
        const status = response === 'accept' ? 'Accepted' : 'Revised';
        const schedStatus = response === 'accept' ? 'Official' : 'Temporary';
        await db.query(
            `INSERT INTO iep_status_history (schedule_id, student_user_id, status, changed_by)
             VALUES ($1, $2, $3, $2)`,
            [schedule_id, studentId, status]
        );
        await db.query(
            `UPDATE generated_schedules SET status = $1
             WHERE student_user_id = $2 AND deleted_at IS NULL`,
            [schedStatus, studentId]
        );
        res.json({ success: true, status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to record response.' });
    }
});

// POST /api/plans/:studentId/advisor-review — advisor approves or declines
router.post('/:studentId/advisor-review', async (req, res) => {
    const { studentId } = req.params;
    const { decision, notes, advisor_id } = req.body; // 'approve' | 'decline'
    try {
        const schedRes = await db.query(
            `SELECT schedule_id FROM generated_schedules
             WHERE student_user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );
        if (!schedRes.rows.length) return res.status(400).json({ error: 'No plan found.' });
        const { schedule_id } = schedRes.rows[0];
        const status = decision === 'approve' ? 'Approved' : 'Declined';
        const schedStatus = decision === 'approve' ? 'Pending_Student_Acceptance' : 'Temporary';
        await db.query(
            `INSERT INTO iep_status_history (schedule_id, student_user_id, status, changed_by, notes)
             VALUES ($1, $2, $3, $4, $5)`,
            [schedule_id, studentId, status, advisor_id || null, notes || null]
        );
        await db.query(
            `UPDATE generated_schedules SET status = $1
             WHERE student_user_id = $2 AND deleted_at IS NULL`,
            [schedStatus, studentId]
        );
        res.json({ success: true, status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to record advisor review.' });
    }
});

// GET /api/plans/:studentId
// Retrieves the most recently saved plan for a student.
router.get('/:studentId', async (req, res) => {
    const studentId = req.params.studentId;
    try {
        const scheduleRes = await db.query(
            `SELECT schedule_id, projected_graduation_term
             FROM generated_schedules
             WHERE student_user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );

        if (!scheduleRes.rows.length) {
            return res.json({ plan: null, graduation_term: null });
        }

        const { schedule_id, projected_graduation_term } = scheduleRes.rows[0];

        const itemsRes = await db.query(
            `SELECT si.item_id,
                    si.course_code,
                    si.semester_year,
                    si.semester_term,
                    si.is_elective,
                    si.resolution_source,
                    si.source_row_id,
                    si.reason,
                    c.credits,
                    c.title,
                    pmr.default_course_id,
                    pmr.allowed_course_ids
             FROM schedule_items si
             LEFT JOIN courses c             ON si.course_code = c.course_code
             LEFT JOIN program_model_row pmr ON si.source_row_id = pmr.id
             WHERE si.schedule_id = $1 AND si.deleted_at IS NULL
             ORDER BY si.semester_year`,
            [schedule_id]
        );

        const rawEntries = itemsRes.rows.map(row => ({
            item_id:            row.item_id,
            course_code:        row.course_code,
            semester_number:    row.semester_year,
            term_code:          row.semester_term,
            credits:            row.credits,
            title:              row.title,
            // Phase 8 elective metadata. The is_elective column may be false
            // on legacy rows; fall back to "course_code IS NULL" for that case
            // so old electives still render correctly.
            is_elective:        row.is_elective || row.course_code === null,
            resolution_source:  row.resolution_source,
            source_row_id:      row.source_row_id,
            default_course_id:  row.default_course_id,
            allowed_courses:    row.allowed_course_ids || [],
            is_student_override: row.resolution_source === 'elective_chosen',
            is_unresolved:      row.resolution_source === 'unresolved',
            reason:             row.reason,
        }));

        const plan = groupPlanEntries(rawEntries);

        // Phase 7 — attach per-semester notes if any exist for this schedule.
        const notesRes = await db.query(
            `SELECT semester_number, code, severity, message
             FROM iep_note
             WHERE schedule_id = $1
             ORDER BY semester_number, created_at`,
            [schedule_id]
        );
        const notesBySemester = new Map();
        for (const n of notesRes.rows) {
            if (!notesBySemester.has(n.semester_number)) notesBySemester.set(n.semester_number, []);
            notesBySemester.get(n.semester_number).push({ code: n.code, severity: n.severity, message: n.message });
        }
        for (const sem of plan) {
            sem.notes = notesBySemester.get(sem.semester) || [];
        }

        // Phase 9 — totals for the credit-total banner. Required total comes
        // from program_model (Phase 6 path) or degree_models (legacy path).
        const totalScheduled = rawEntries
            .filter(e => !e.is_unresolved && e.course_code)
            .reduce((sum, e) => sum + (e.credits || 0), 0);

        const requiredRes = await db.query(
            `SELECT COALESCE(pm.total_credits_required, dm.total_credits_required) AS total
             FROM student_profiles sp
             LEFT JOIN program_model pm ON sp.selected_program_model_id = pm.id
             LEFT JOIN degree_models dm ON sp.current_degree_model_id   = dm.model_id
             WHERE sp.user_id = $1`,
            [studentId]
        );
        const totalRequired = requiredRes.rows[0]?.total ?? null;

        res.json({
            plan,
            graduation_term:          projected_graduation_term,
            total_credits_scheduled:  totalScheduled,
            total_credits_required:   totalRequired,
        });

    } catch (err) {
        console.error('Get Plan Error:', err.message);
        res.status(500).json({ error: 'Failed to retrieve plan.' });
    }
});

// Groups flat plan entries into semester objects for the frontend.
// Phase 6 — generate a plan via IEPGeneratorService for students wired to a
// program_model. Persists the same schedule_items shape the legacy path uses
// (course_code, semester_year, semester_term) so existing GET / PUT routes
// keep working unchanged.
async function generateWithIEPService(studentId, student, res) {
    // Program model header.
    const pmRes = await db.query(
        `SELECT id, program_id, total_credits_required
         FROM program_model WHERE id = $1`,
        [student.selected_program_model_id]
    );
    if (!pmRes.rows.length) {
        return res.status(400).json({ error: 'Program model not found for this student.' });
    }
    const programModel = pmRes.rows[0];

    // Program model rows joined with courses for credits + prereqs.
    const rowsRes = await db.query(
        `SELECT pmr.id, pmr.priority, pmr.course_id, pmr.category, pmr.level,
                pmr.is_elective, pmr.default_course_id, pmr.allowed_course_ids,
                pmr.term_length, pmr.offered_in_summer,
                c.credits          AS row_credits,
                c.prerequisite_codes
         FROM program_model_row pmr
         LEFT JOIN courses c ON c.course_code = pmr.course_id
         WHERE pmr.program_model_id = $1
         ORDER BY pmr.priority ASC`,
        [student.selected_program_model_id]
    );

    // Elective rows have NULL course_id — fetch credits + prereqs for their
    // default_course_id so the generator can size the slot.
    const electiveDefaultIds = rowsRes.rows
        .filter(r => r.is_elective && r.default_course_id)
        .map(r => r.default_course_id);
    const electiveCreditsMap = new Map();
    if (electiveDefaultIds.length > 0) {
        const elecRes = await db.query(
            `SELECT course_code, credits, prerequisite_codes
             FROM courses WHERE course_code = ANY($1)`,
            [electiveDefaultIds]
        );
        for (const c of elecRes.rows) electiveCreditsMap.set(c.course_code, c);
    }

    const rows = rowsRes.rows.map(r => {
        const electiveDefault = r.is_elective ? electiveCreditsMap.get(r.default_course_id) : null;
        const credits  = r.row_credits ?? electiveDefault?.credits ?? 3;
        const prereqs  = parsePrereqCodes(r.prerequisite_codes ?? electiveDefault?.prerequisite_codes ?? '');
        return {
            id:                 r.id,
            priority:           r.priority,
            course_id:          r.course_id,
            category:           r.category,
            level:              r.level,
            is_elective:        r.is_elective,
            default_course_id:  r.default_course_id,
            allowed_course_ids: r.allowed_course_ids,
            term_length:        r.term_length,
            offered_in_summer:  r.offered_in_summer,
            credits,
            prerequisites:      prereqs,
        };
    });

    // Restrict prereqs to the set the algorithm can actually resolve. Anything
    // outside the model and not in the student's transcript would cause a row
    // to be permanently unresolved (correctly so, but worth pruning the noise
    // from external prereqs the model never references).
    const historyRes = await db.query(
        `SELECT course_code FROM academic_history
         WHERE user_id = $1 AND deleted_at IS NULL`,
        [studentId]
    );
    const completedCourses = historyRes.rows.map(r => ({ course_id: r.course_code }));

    // Phase 11 — tighten the filter. Only count required course_ids, elective
    // defaults, and the student's transcript as "known". Allowed-but-not-default
    // elective alternates are dropped so OR-encoded-as-AND prereqs (a known
    // gap in the data layer) don't permanently strand required rows. Faculty
    // get a PREREQ_OUT_OF_PROGRAM note for every row whose prereq set shrunk.
    const knownIds       = buildKnownPrereqIds(rows, completedCourses);
    const droppedPrereqs = filterPrereqsAndCollectDrops(rows, knownIds);

    const input = {
        programModel: {
            program_id:             programModel.program_id,
            total_credits_required: programModel.total_credits_required,
            rows,
        },
        studentProfile: {
            starting_term:              student.starting_term,
            takes_summer:               student.takes_summer,
            target_courses_fall_spring: student.target_courses_fall_spring,
            target_credits_fall_spring: student.target_credits_fall_spring,
            target_courses_summer:      student.target_courses_summer,
            target_credits_summer:      student.target_credits_summer,
        },
        completedCourses,
    };

    const result = iepGenerator.generate(input);

    // Phase 11 — for each row whose prereqs got filtered out, add an info
    // note to whichever semester actually contains the row. If the row didn't
    // land (rare given the filter just relaxed the gating), fall back to the
    // first semester so faculty still see the warning.
    for (const drop of droppedPrereqs) {
        const sem = result.semesters.find(s =>
            s.courses.some(c => c.source_row_id === drop.source_row_id)
        ) || result.semesters[0];
        if (!sem) continue;
        sem.notes.push({
            code:     'PREREQ_OUT_OF_PROGRAM',
            severity: 'info',
            message:  `${drop.course_id || 'Row'} has prerequisites outside this program model: ${drop.dropped.join(', ')}. Verify with curriculum chair.`,
        });
    }

    // Persist. NULL course_code rows (electives whose default we want to keep
    // editable, and unresolved slots) are stored as NULL — the existing
    // schedule_items column allows NULL since Phase 1.
    const client = await db.getClient();
    let scheduleId;
    try {
        await client.query('BEGIN');
        await client.query(
            `DELETE FROM generated_schedules WHERE student_user_id = $1`,
            [studentId]
        );
        const sRes = await client.query(
            `INSERT INTO generated_schedules (student_user_id, projected_graduation_term, status)
             VALUES ($1, $2, 'Official') RETURNING schedule_id`,
            [studentId, result.graduation_term]
        );
        scheduleId = sRes.rows[0].schedule_id;
        for (const sem of result.semesters) {
            for (const c of sem.courses) {
                await client.query(
                    `INSERT INTO schedule_items
                        (schedule_id, course_code, semester_year, semester_term,
                         is_elective, resolution_source, source_row_id, reason)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        scheduleId,
                        c.is_unresolved ? null : c.course_id,
                        sem.semester_number,
                        sem.term_code,
                        !!c.is_elective,
                        c.resolution_source || (c.is_unresolved ? 'unresolved' : 'required'),
                        c.source_row_id || null,
                        c.is_unresolved ? (c.reason || null) : null,
                    ]
                );
            }
            for (const note of (sem.notes || [])) {
                await client.query(
                    `INSERT INTO iep_note (schedule_id, semester_number, code, severity, message)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [scheduleId, sem.semester_number, note.code, note.severity, note.message]
                );
            }
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    // Build a row-id → { default_course_id, allowed_course_ids } map so the
    // POST response carries the same picker metadata the GET response does.
    const rowLookup = new Map(rows.map(r => [r.id, r]));

    const planEntries = result.semesters.flatMap(sem =>
        sem.courses.map(c => {
            const sourceRow = c.source_row_id ? rowLookup.get(c.source_row_id) : null;
            return {
                course_id:           c.is_unresolved ? null : c.course_id,
                semester_number:     sem.semester_number,
                term_code:           sem.term_code,
                credits:             c.credits,
                is_elective:         c.is_elective || c.is_unresolved,
                resolution_source:   c.resolution_source,
                source_row_id:       c.source_row_id,
                default_course_id:   sourceRow?.default_course_id ?? null,
                allowed_courses:     sourceRow?.allowed_course_ids ?? [],
                is_student_override: c.resolution_source === 'elective_chosen',
                is_unresolved:       !!c.is_unresolved,
                reason:              c.reason || null,
            };
        })
    );

    const plan = groupPlanEntries(planEntries);
    const notesBySemester = new Map(result.semesters.map(s => [s.semester_number, s.notes || []]));
    for (const sem of plan) {
        sem.notes = notesBySemester.get(sem.semester) || [];
    }

    return res.json({
        student_id:              studentId,
        semesters_count:         result.semesters.length,
        plan,
        graduation_term:         result.graduation_term,
        total_credits_scheduled: result.total_credits_scheduled,
        total_credits_required:  result.total_credits_required,
    });
}

function groupPlanEntries(entries) {
    const grouped = {};
    for (const entry of entries) {
        const key = entry.semester_number;
        if (!grouped[key]) {
            grouped[key] = { semester: key, term_code: entry.term_code, courses: [] };
        }
        // Algorithm entries use course_id; DB entries use course_code.
        const courseCode = entry.course_code ?? entry.course_id ?? null;
        const isElective = entry.is_elective === true || courseCode === null;
        grouped[key].courses.push({
            course_code:         courseCode,
            credits:             entry.credits,
            title:               entry.title || null,
            is_elective:         isElective,
            // Phase 8/9 — pass elective + unresolved metadata through so the UI
            // can render the picker and the unresolved-slot banner. Older
            // callers that don't set these get undefined values and the picker
            // simply won't render.
            item_id:             entry.item_id ?? null,
            resolution_source:   entry.resolution_source ?? null,
            source_row_id:       entry.source_row_id ?? null,
            default_course_id:   entry.default_course_id ?? null,
            allowed_courses:     entry.allowed_courses ?? [],
            is_student_override: !!entry.is_student_override,
            is_unresolved:       !!entry.is_unresolved,
            reason:              entry.reason ?? null,
        });
    }
    return Object.values(grouped);
}

module.exports = router;
