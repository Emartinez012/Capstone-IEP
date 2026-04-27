// =============================================================================
// server/services/IEPGeneratorService.js
//
// M2 IEP generator — the Phase 6 replacement for legacy planAlgorithm.createPlan.
//
// Reads a faculty-authored, priority-ordered program_model with explicit
// level / elective metadata; emits a deterministic, semester-by-semester IEP.
//
// Key behaviors (vs. legacy createPlan):
//   • Iterates rows in authored priority. Never recomputes priority or level.
//   • Skip-and-retry: a row that can't be placed this semester is tried again
//     next semester (no allow-list traps and no placeholder cascade).
//   • Electives resolve to default_course_id unless the student supplied an
//     override via studentProfile.elective_overrides[<priority>].
//   • Unresolved rows surface as explicit slots with reason — never silent.
//   • Term cycle respects takes_summer; skipped summer terms don't consume a
//     semester number.
//
// Out of scope (deferred to later phases):
//   • IEPNoteEmitter (Phase 7) — generator returns notes [] but doesn't emit
//     COURSE_COUNT_MISMATCH / BELOW_CREDIT_TARGET / financial-aid notes yet.
//   • Lab corequisite pairing (Phase 12) — lab rows must be authored on the
//     model; embedded-lab detection is not done here.
//   • Substitution pre-pass (Phase 12) — STEP 0 is a no-op.
// =============================================================================

const { emitNotes } = require('./IEPNoteEmitter');

const MAX_SEMESTERS = 30;
const DEFAULT_CREDITS = 3;

// -----------------------------------------------------------------------------
// Term-code helpers (YYT format — '261' = Fall 2026, '262' = Spring 2027,
// '263' = Summer 2027). Mirrors planAlgorithm.updateTerm semantics.
// -----------------------------------------------------------------------------

function termPart(term) {
    return parseInt(term.slice(-1), 10);
}
function yearPart(term) {
    return parseInt(term.slice(0, -1), 10);
}
function isSummerTerm(term)  { return termPart(term) === 3; }
function isFallTerm(term)    { return termPart(term) === 1; }
function isSpringTerm(term)  { return termPart(term) === 2; }

function termType(term) {
    if (isFallTerm(term))   return 'fall';
    if (isSpringTerm(term)) return 'spring';
    if (isSummerTerm(term)) return 'summer';
    return 'unknown';
}

function nextTerm(term) {
    const t = termPart(term);
    const y = yearPart(term);
    if (t === 1) return `${y}2`;
    if (t === 2) return `${y}3`;
    return `${y + 1}1`;
}

// -----------------------------------------------------------------------------
// Level compatibility (CR-04). Two courses share a semester only if:
//   1. the semester is empty, OR
//   2. they share the same authored level, OR
//   3. one is FIRST_8 and the other is SECOND_8 (8-week complement), OR
//   4. the higher-level row's prereqs are already in the completed set
//      (i.e., adding an upper-level course on top of a lower-level slate is
//      fine when its dependency is already cleared from prior semesters).
// -----------------------------------------------------------------------------

function levelCompatible(row, semesterCourses, completedSet) {
    if (semesterCourses.length === 0) return true;

    const candidateLevel = row.level ?? 1;
    const candidateLen   = row.term_length || 'FULL_16_WEEK';

    for (const placed of semesterCourses) {
        const placedLevel = placed.level ?? 1;
        const placedLen   = placed.term_length || 'FULL_16_WEEK';

        if (candidateLevel === placedLevel) continue;
        if (candidateLen === 'FIRST_8_WEEK'  && placedLen === 'SECOND_8_WEEK') continue;
        if (candidateLen === 'SECOND_8_WEEK' && placedLen === 'FIRST_8_WEEK')  continue;

        const higher = candidateLevel > placedLevel ? row : placed.sourceRow;
        if (higher && (higher.prerequisites || []).every(p => completedSet.has(p))) continue;

        return false;
    }
    return true;
}

// -----------------------------------------------------------------------------
// Prereq satisfaction. Phase 6 supports AND-only prereq lists; OR-logic is
// listed in the plan's known gaps and is not addressed here.
// -----------------------------------------------------------------------------

function prereqsSatisfied(row, completedSet) {
    const prereqs = row.prerequisites || [];
    return prereqs.every(p => completedSet.has(p));
}

// -----------------------------------------------------------------------------
// Candidate resolution. For required rows it's just course_id. For elective
// rows we check the student's per-priority override before falling back to
// the faculty-authored default.
// -----------------------------------------------------------------------------

function resolveCandidate(row, studentProfile) {
    if (!row.is_elective) {
        return { course_id: row.course_id, resolution_source: 'required' };
    }
    const overrides = studentProfile.elective_overrides || {};
    const override  = overrides[row.priority];
    if (override) {
        return { course_id: override, resolution_source: 'elective_chosen' };
    }
    return { course_id: row.default_course_id, resolution_source: 'elective_default' };
}

// -----------------------------------------------------------------------------
// Targets per semester type.
// -----------------------------------------------------------------------------

function targetsFor(term, studentProfile) {
    if (isSummerTerm(term)) {
        return {
            target_courses: studentProfile.target_courses_summer || 0,
            target_credits: studentProfile.target_credits_summer || 0,
        };
    }
    return {
        target_courses: studentProfile.target_courses_fall_spring || 3,
        target_credits: studentProfile.target_credits_fall_spring || 12,
    };
}

// -----------------------------------------------------------------------------
// Main entry point.
// -----------------------------------------------------------------------------

function generate(input) {
    if (!input || !input.programModel || !input.studentProfile) {
        throw new Error('IEPGeneratorService.generate: programModel and studentProfile are required');
    }

    const { programModel, studentProfile } = input;
    const completedCourses = input.completedCourses || [];
    const completedSet = new Set(
        completedCourses.map(c => (typeof c === 'string' ? c : c.course_id))
    );

    // STEP 0 — substitution pre-pass (Phase 12 stretch; intentional no-op).

    // STEP 1 — Mark completed rows. Required rows match by course_id; elective
    // rows match if any of their allowed_course_ids has been completed.
    const rows = (programModel.rows || []).map(r => {
        let satisfied = false;
        if (r.is_elective) {
            const allowed = r.allowed_course_ids || [];
            if (allowed.some(c => completedSet.has(c))) satisfied = true;
        } else if (r.course_id && completedSet.has(r.course_id)) {
            satisfied = true;
        }
        return { ...r, satisfied, satisfied_by: satisfied ? 'completed' : null };
    });

    // STEP 2 — Determine the first semester. If the student does not take
    // summer and the starting term is summer, advance until we hit fall/spring.
    let term = studentProfile.starting_term;
    while (isSummerTerm(term) && !studentProfile.takes_summer) {
        term = nextTerm(term);
    }

    // STEP 3 — Per-semester loop.
    const semesters = [];
    let semesterNumber = 0;

    while (rows.some(r => !r.satisfied) && semesterNumber < MAX_SEMESTERS) {
        if (isSummerTerm(term) && !studentProfile.takes_summer) {
            term = nextTerm(term);
            continue;
        }

        semesterNumber += 1;
        const targets = targetsFor(term, studentProfile);
        const placed  = [];
        let creditsThisSemester = 0;

        for (const row of rows) {
            if (row.satisfied) continue;
            if (placed.length >= targets.target_courses) break;

            // Summer-only check: row offered_in_summer = false skips summer.
            if (isSummerTerm(term) && row.offered_in_summer === false) continue;

            const resolved = resolveCandidate(row, studentProfile);
            if (!resolved.course_id) continue;

            // Already completed this exact course (e.g. an elective whose
            // default the student happens to have on transcript).
            if (completedSet.has(resolved.course_id)) {
                row.satisfied    = true;
                row.satisfied_by = 'completed';
                continue;
            }

            if (!prereqsSatisfied(row, completedSet)) continue;
            if (!levelCompatible(row, placed, completedSet)) continue;

            const credits = row.credits ?? DEFAULT_CREDITS;
            if (creditsThisSemester + credits > targets.target_credits + 1) continue;

            placed.push({
                course_id:         resolved.course_id,
                credits,
                level:             row.level ?? 1,
                category:          row.category || null,
                is_elective:       !!row.is_elective,
                is_unresolved:     false,
                resolution_source: resolved.resolution_source,
                source_row_id:     row.id || null,
                source_row_priority: row.priority,
                term_length:       row.term_length || 'FULL_16_WEEK',
                sourceRow:         row, // used by levelCompatible for next placements
            });

            creditsThisSemester += credits;
            row.satisfied    = true;
            row.satisfied_by = resolved.resolution_source;
            completedSet.add(resolved.course_id);
        }

        // Deadlock guard. If we placed nothing and targets aren't zero, every
        // remaining row is blocked indefinitely — let STEP 4 surface them
        // rather than emit MAX_SEMESTERS empty semesters.
        if (placed.length === 0) {
            semesterNumber -= 1;
            if (targets.target_courses > 0) break;
            term = nextTerm(term);
            continue;
        }

        // Strip the internal sourceRow handle before exposing the placement.
        const courses = placed.map(({ sourceRow, ...rest }) => rest); // eslint-disable-line no-unused-vars

        const semesterRecord = {
            semester_number: semesterNumber,
            term_code:       term,
            term_type:       termType(term),
            target_courses:  targets.target_courses,
            target_credits:  targets.target_credits,
            scheduled_courses: courses.length,
            scheduled_credits: creditsThisSemester,
            courses,
            notes:           [],
        };
        semesterRecord.notes = emitNotes(semesterRecord, targets);
        semesters.push(semesterRecord);

        term = nextTerm(term);
    }

    // STEP 4 — Unresolved slots. Any row still unsatisfied is exposed
    // explicitly so the advisor UI can route it for review (CR-11).
    const unresolved = rows
        .filter(r => !r.satisfied)
        .map(r => ({
            course_id:         null,
            credits:           r.credits ?? DEFAULT_CREDITS,
            level:             r.level ?? 1,
            category:          r.category || null,
            is_elective:       !!r.is_elective,
            is_unresolved:     true,
            resolution_source: 'unresolved',
            reason: r.is_elective
                ? `Elective default ${r.default_course_id || '(none)'} could not be placed`
                : `Prerequisites for ${r.course_id} could not be satisfied`,
            source_row_id:       r.id || null,
            source_row_priority: r.priority,
            term_length:         r.term_length || 'FULL_16_WEEK',
        }));

    if (unresolved.length > 0) {
        const lastTerm = semesters.length > 0
            ? semesters[semesters.length - 1].term_code
            : term;
        semesters.push({
            semester_number:   semesterNumber + 1,
            term_code:         nextTerm(lastTerm),
            term_type:         'unresolved',
            target_courses:    0,
            target_credits:    0,
            scheduled_courses: 0,
            scheduled_credits: 0,
            courses:           unresolved,
            notes:             [],
        });
    }

    const totalCreditsScheduled = semesters
        .flatMap(s => s.courses)
        .filter(c => !c.is_unresolved)
        .reduce((sum, c) => sum + (c.credits || 0), 0);

    const graduationTerm = semesters.length > 0
        ? semesters[semesters.length - 1].term_code
        : term;

    return {
        program_id:               programModel.program_id || null,
        graduation_term:          graduationTerm,
        total_credits_scheduled:  totalCreditsScheduled,
        total_credits_required:   programModel.total_credits_required || null,
        semesters,
    };
}

module.exports = {
    generate,
    // exported for unit testing
    _internal: { nextTerm, isSummerTerm, termType, levelCompatible, prereqsSatisfied, resolveCandidate },
};
