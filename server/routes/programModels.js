// =============================================================================
// server/routes/programModels.js
//
// Faculty-facing CRUD-lite for program_model + program_model_row. Powers the
// Phase 10 ProgramModelEditor UI in ChairpersonDashboard.
//
// Endpoints:
//   GET    /api/program-models?program_id=BS-AAI         — list versions
//   GET    /api/program-models/:id                       — model + rows
//   PATCH  /api/program-models/:id/rows/:rowId           — edit one row
//   POST   /api/program-models/:id/activate              — flip active version
// =============================================================================

const express = require('express');
const db      = require('../db');
const router  = express.Router();

// -----------------------------------------------------------------------------
// Pure validation helper — exported for unit tests in iep-regression.test.js.
//
// `existing`: row currently in the DB.
// `patch`:    fields the client wants to change (any subset).
// `otherPriorities`: Set<int> of priority values used by SIBLING rows in the
//                    same program_model (not including `existing`).
//
// Returns either { error: { status, message } } or { next: <merged row> }.
// -----------------------------------------------------------------------------

const ALLOWED_TERM_LENGTHS = new Set(['FULL_16_WEEK', 'FIRST_8_WEEK', 'SECOND_8_WEEK']);

function validateRowPatch(existing, patch, otherPriorities) {
    const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);
    const next = {
        priority:           has('priority')           ? patch.priority           : existing.priority,
        course_id:          has('course_id')          ? patch.course_id          : existing.course_id,
        category:           has('category')           ? patch.category           : existing.category,
        level:              has('level')              ? patch.level              : existing.level,
        is_elective:        has('is_elective')        ? !!patch.is_elective      : !!existing.is_elective,
        default_course_id:  has('default_course_id')  ? patch.default_course_id  : existing.default_course_id,
        allowed_course_ids: has('allowed_course_ids') ? patch.allowed_course_ids : existing.allowed_course_ids,
        term_length:        has('term_length')        ? patch.term_length        : existing.term_length,
        offered_in_summer:  has('offered_in_summer')  ? !!patch.offered_in_summer : !!existing.offered_in_summer,
    };

    if (!Number.isInteger(next.priority) || next.priority < 1) {
        return { error: { status: 400, message: 'priority must be a positive integer.' } };
    }
    if (!Number.isInteger(next.level) || next.level < 1) {
        return { error: { status: 400, message: 'level must be a positive integer.' } };
    }
    if (next.term_length && !ALLOWED_TERM_LENGTHS.has(next.term_length)) {
        return { error: { status: 400, message: `term_length must be one of ${[...ALLOWED_TERM_LENGTHS].join(', ')}.` } };
    }

    if (next.priority !== existing.priority && otherPriorities.has(next.priority)) {
        return { error: { status: 409, message: `Priority ${next.priority} already in use within this model.` } };
    }

    if (next.is_elective) {
        const allowed = next.allowed_course_ids || [];
        if (next.default_course_id && !allowed.includes(next.default_course_id)) {
            return { error: { status: 400, message: 'default_course_id must be in allowed_course_ids for elective rows.' } };
        }
    }

    return { next };
}

// -----------------------------------------------------------------------------
// GET /api/program-models?program_id=BS-AAI
// -----------------------------------------------------------------------------

router.get('/', async (req, res) => {
    const { program_id } = req.query;
    try {
        const params = [];
        let where = '';
        if (program_id) {
            params.push(program_id);
            where = 'WHERE pm.program_id = $1';
        }
        const result = await db.query(
            `SELECT pm.id, pm.program_id, pm.version, pm.is_active,
                    pm.effective_term, pm.created_at,
                    dp.program_name,
                    (SELECT COUNT(*) FROM program_model_row WHERE program_model_id = pm.id) AS row_count
             FROM program_model pm
             LEFT JOIN degree_programs dp ON pm.program_id = dp.degree_code
             ${where}
             ORDER BY pm.program_id, pm.version DESC`,
            params
        );
        res.json(result.rows);
    } catch (err) {
        console.error('list program-models error:', err);
        res.status(500).json({ error: 'Failed to list program models.' });
    }
});

// -----------------------------------------------------------------------------
// GET /api/program-models/:id
// -----------------------------------------------------------------------------

router.get('/:id', async (req, res) => {
    try {
        const modelRes = await db.query(
            `SELECT pm.*, dp.program_name
             FROM program_model pm
             LEFT JOIN degree_programs dp ON pm.program_id = dp.degree_code
             WHERE pm.id = $1`,
            [req.params.id]
        );
        if (!modelRes.rows.length) {
            return res.status(404).json({ error: 'Program model not found.' });
        }

        const rowsRes = await db.query(
            `SELECT pmr.*,
                    c.title  AS course_title,
                    dc.title AS default_course_title
             FROM program_model_row pmr
             LEFT JOIN courses c  ON c.course_code  = pmr.course_id
             LEFT JOIN courses dc ON dc.course_code = pmr.default_course_id
             WHERE pmr.program_model_id = $1
             ORDER BY pmr.priority ASC`,
            [req.params.id]
        );

        res.json({ ...modelRes.rows[0], rows: rowsRes.rows });
    } catch (err) {
        console.error('get program-model error:', err);
        res.status(500).json({ error: 'Failed to fetch program model.' });
    }
});

// -----------------------------------------------------------------------------
// PATCH /api/program-models/:id/rows/:rowId
// -----------------------------------------------------------------------------

router.patch('/:id/rows/:rowId', async (req, res) => {
    const { id, rowId } = req.params;
    try {
        const existingRes = await db.query(
            `SELECT * FROM program_model_row WHERE id = $1 AND program_model_id = $2`,
            [rowId, id]
        );
        if (!existingRes.rows.length) {
            return res.status(404).json({ error: 'Row not found in this program model.' });
        }
        const existing = existingRes.rows[0];

        const siblingsRes = await db.query(
            `SELECT priority FROM program_model_row
             WHERE program_model_id = $1 AND id <> $2`,
            [id, rowId]
        );
        const otherPriorities = new Set(siblingsRes.rows.map(r => r.priority));

        const { error, next } = validateRowPatch(existing, req.body || {}, otherPriorities);
        if (error) return res.status(error.status).json({ error: error.message });

        const updateRes = await db.query(
            `UPDATE program_model_row
             SET priority           = $1,
                 course_id          = $2,
                 category           = $3,
                 level              = $4,
                 is_elective        = $5,
                 default_course_id  = $6,
                 allowed_course_ids = $7,
                 term_length        = $8,
                 offered_in_summer  = $9
             WHERE id = $10
             RETURNING *`,
            [
                next.priority,
                next.course_id || null,
                next.category  || null,
                next.level,
                next.is_elective,
                next.default_course_id || null,
                next.allowed_course_ids || null,
                next.term_length || 'FULL_16_WEEK',
                next.offered_in_summer,
                rowId,
            ]
        );
        res.json(updateRes.rows[0]);
    } catch (err) {
        console.error('patch row error:', err);
        // Postgres FK violation surfaces as 23503 — give the client a clear hint.
        if (err.code === '23503') {
            return res.status(400).json({ error: 'Referenced course does not exist in courses table.' });
        }
        res.status(500).json({ error: 'Failed to update row.' });
    }
});

// -----------------------------------------------------------------------------
// POST /api/program-models/:id/activate
// -----------------------------------------------------------------------------

router.post('/:id/activate', async (req, res) => {
    try {
        const modelRes = await db.query(
            `SELECT id, program_id, is_active FROM program_model WHERE id = $1`,
            [req.params.id]
        );
        if (!modelRes.rows.length) {
            return res.status(404).json({ error: 'Program model not found.' });
        }
        const { program_id } = modelRes.rows[0];

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE program_model SET is_active = false
                 WHERE program_id = $1 AND id <> $2`,
                [program_id, req.params.id]
            );
            await client.query(
                `UPDATE program_model SET is_active = true WHERE id = $1`,
                [req.params.id]
            );
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        res.json({ id: req.params.id, program_id, is_active: true });
    } catch (err) {
        console.error('activate program-model error:', err);
        res.status(500).json({ error: 'Failed to activate program model.' });
    }
});

module.exports = router;
module.exports.validateRowPatch = validateRowPatch;
