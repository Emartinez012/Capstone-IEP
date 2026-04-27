// =============================================================================
// server/services/IEPNoteEmitter.js
//
// Emits structured per-semester notes for the IEP generator. Each note is
// { code, severity, message } where severity ∈ {'info', 'warning'}. The
// IEPGeneratorService calls this once per scheduled semester; advisor +
// student dashboards render the result alongside the course list.
//
// Codes (from PROFESSOR_MEETING_IMPLEMENTATION_PLAN.md §8):
//   COURSE_COUNT_MISMATCH                — warning  (scheduled != target)
//   BELOW_CREDIT_TARGET                  — warning  (credits < target)
//   ABOVE_CREDIT_TARGET                  — info     (credits > target)
//   FINANCIAL_AID_PART_TIME_FALL_SPRING  — info     (Fall/Spring < 12 credits)
//   FINANCIAL_AID_PART_TIME_SUMMER       — info     (Summer < 9 credits)
//
// Additional codes emitted elsewhere (not by this module):
//   PREREQ_OUT_OF_PROGRAM                — info     (Phase 11: required row's
//     prereq isn't in the program model. Emitted from plans.js after the
//     prereq-filter step so faculty can clean up curriculum encoding.)
//
// Financial-aid notes are *always* informational — never enforced, never block
// generation. Threshold for summer (9) is the plan's tentative default and is
// flagged as "confirm with client" — adjust SUMMER_FT_THRESHOLD if it changes.
// =============================================================================

const FALL_SPRING_FT_THRESHOLD = 12;
const SUMMER_FT_THRESHOLD      = 9;

function emitNotes(semester, targets) {
    const notes = [];
    if (!semester || semester.term_type === 'unresolved') return notes;

    const courses = Number(semester.scheduled_courses ?? 0);
    const credits = Number(semester.scheduled_credits ?? 0);
    const tc      = Number(targets.target_courses ?? 0);
    const tcr     = Number(targets.target_credits ?? 0);

    if (courses !== tc) {
        notes.push({
            code:     'COURSE_COUNT_MISMATCH',
            severity: 'warning',
            message:  `Scheduled ${courses} ${courses === 1 ? 'course' : 'courses'}; target was ${tc}.`,
        });
    }

    if (credits < tcr) {
        notes.push({
            code:     'BELOW_CREDIT_TARGET',
            severity: 'warning',
            message:  `Scheduled ${credits} credits; target was ${tcr}.`,
        });
    } else if (credits > tcr) {
        notes.push({
            code:     'ABOVE_CREDIT_TARGET',
            severity: 'info',
            message:  `Scheduled ${credits} credits; exceeds target of ${tcr}.`,
        });
    }

    if ((semester.term_type === 'fall' || semester.term_type === 'spring')
        && credits < FALL_SPRING_FT_THRESHOLD) {
        notes.push({
            code:     'FINANCIAL_AID_PART_TIME_FALL_SPRING',
            severity: 'info',
            message:  `Below the ${FALL_SPRING_FT_THRESHOLD}-credit full-time threshold for Fall/Spring financial aid.`,
        });
    }
    if (semester.term_type === 'summer'
        && credits < SUMMER_FT_THRESHOLD) {
        notes.push({
            code:     'FINANCIAL_AID_PART_TIME_SUMMER',
            severity: 'info',
            message:  `Below the ${SUMMER_FT_THRESHOLD}-credit full-time threshold for Summer financial aid.`,
        });
    }

    return notes;
}

module.exports = {
    emitNotes,
    FALL_SPRING_FT_THRESHOLD,
    SUMMER_FT_THRESHOLD,
};
