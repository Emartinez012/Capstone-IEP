// =============================================================================
// server/services/prereqFilter.js
//
// Pure helpers used by plans.js → generateWithIEPService to clean up program
// model rows before passing them to the generator.
//
// Why: courses.prerequisite_codes is a comma-separated AND list, but the seed
// data sometimes encodes alternates (OR semantics) the same way. When a row's
// listed prereq isn't in the program model and isn't on the student's
// transcript, the generator can never schedule it; left unfiltered, the row
// surfaces as Unresolved. Dropping such prereqs at the filter step lets the
// generator place the row, and we emit a PREREQ_OUT_OF_PROGRAM info note so
// faculty can revisit the curriculum encoding via the Phase 10 editor.
// =============================================================================

// Build the set of course_ids the generator can realistically schedule:
//   • required rows' course_id
//   • elective rows' default_course_id
//   • the student's completedCourses (string codes or { course_id } objects)
//
// Note: allowed_course_ids on elective rows are intentionally NOT included.
// They're hypothetical paths the student might choose; treating them as
// "known" would let prereqs hide behind alternate-elective options and never
// actually be scheduled.
function buildKnownPrereqIds(rows, completedCourses = []) {
    const ids = new Set();
    for (const r of rows || []) {
        if (r.course_id)         ids.add(r.course_id);
        if (r.default_course_id) ids.add(r.default_course_id);
    }
    for (const c of completedCourses) {
        const code = typeof c === 'string' ? c : c?.course_id;
        if (code) ids.add(code);
    }
    return ids;
}

// Mutates each row's `prerequisites` array in place: keeps only those that
// are in `knownIds`. Returns a structured list of every row whose prereq set
// actually shrunk, so plans.js can attach faculty-visible notes.
function filterPrereqsAndCollectDrops(rows, knownIds) {
    const drops = [];
    for (const r of rows || []) {
        const before = r.prerequisites || [];
        const after  = before.filter(p => knownIds.has(p));
        if (after.length !== before.length) {
            drops.push({
                source_row_id: r.id || null,
                course_id:     r.course_id || null,
                dropped:       before.filter(p => !knownIds.has(p)),
            });
        }
        r.prerequisites = after;
    }
    return drops;
}

module.exports = {
    buildKnownPrereqIds,
    filterPrereqsAndCollectDrops,
};
