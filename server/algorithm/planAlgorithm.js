// =============================================================================
// planAlgorithm.js
// Expert Advisor — Core Scheduling Algorithm
//
// Scheduling rules:
//
//   PREREQUISITES
//   - Each course has a `prerequisites` array of course_ids.
//   - A course's LEVEL is derived from its prerequisite chain:
//       level 1 = no prerequisites
//       level N = 1 + max level of its prerequisites
//   - A level-1 prerequisite may be taken in the SAME semester as a course
//     that depends on it.
//   - A level-2+ prerequisite must be in a STRICTLY EARLIER semester.
//
//   COREQUISITES
//   - A course may have a `corequisite_code` field which is either a single
//     course_id string, an array of course_ids, or null/undefined.
//   - The relationship is SYMMETRIC AND HARD: if A lists B, both A and B
//     must be scheduled in the same semester. Neither can go alone, even
//     if B's own corequisite_code doesn't mention A — the reverse edge is
//     inferred at setup time.
//   - Transitive: if A lists B and B lists C, the group is {A, B, C}.
//   - When scheduling any member of a coreq group, the whole group is
//     pulled together as a single atomic unit. All members fit together
//     (within cap + buffer) with all prereqs satisfied, or the whole
//     group defers.
//   - Fallback: if a course has no corequisite_code but the next model
//     entry (in priority order) has course_id = this course's id + 'L',
//     they're implicitly linked. This preserves the older positional
//     lab-detection behavior for data without corequisite_code.
//
//   CREDITS
//   - Semester capacity is measured in CREDITS (student.credits_per_semester).
//   - `creditBuffer` is a tolerance: a course (or coreq group) whose total
//     would exceed the cap by <= buffer is still allowed in. Defaults to 2
//     when not passed, which is usually enough to absorb a lab or one
//     heavy-credit course.
//   - Program total: degreeModel.total_credits_required. Transcript courses
//     count toward this only if they appear in the model.
//
//   STRICT PRIORITY (hybrid)
//   - Model is walked in priority_index ASC order.
//   - Normally: the first course (or coreq group) that can't be placed
//     stops the walk for this semester. We do NOT skip ahead to fit
//     smaller courses.
//   - HYBRID EXCEPTION: when a group is blocked, we record the course_ids
//     on that blocked group's prerequisite chain (transitive) as an
//     allow-list and keep walking. Only courses in the allow-list can
//     still be placed. This lets lower-priority prereqs get placed this
//     semester so they can unblock the blocked group next semester. If a
//     second block occurs, its prereq chain is merged into the allow-list.
//   - Remaining seats become "Student Elective" rows.
// =============================================================================


const DEFAULT_CREDITS = 3;
const ELECTIVE_CREDITS = 3;
const DEFAULT_CREDIT_BUFFER = 2;


/** Return a course's credits, defaulting to DEFAULT_CREDITS. */
function creditsOf(course) {
    return (course && typeof course.credits === 'number') ? course.credits : DEFAULT_CREDITS;
}


/**
 * Normalize a course's corequisite_code into an array of course_ids.
 * Accepts: string, array of strings, null, undefined.
 */
function coreqsOf(course) {
    const raw = course && course.corequisite_code;
    if (raw === null || raw === undefined || raw === '') return [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    return [raw];
}


/** Is `candidate` the positional lab companion of `parent`? */
function isLabCompanionOf(parent, candidate) {
    if (!parent || !candidate) return false;
    return candidate.course_id === parent.course_id + 'L';
}


/**
 * FUNCTION 1 — createStudentModel
 *
 * Marks each course in the degree model as "taken" or "not taken" based on
 * the student's transcript. Handles substitutions.
 *
 * Positional lab inference: if a model entry's course_id ends in 'L' and its
 * parent course_id (without the trailing 'L') is taken, the lab is also
 * marked as taken. This applies ONLY to positional labs — courses linked
 * via an explicit corequisite_code field are NOT auto-marked this way.
 * Rationale: students who took the lecture historically also took the lab
 * even if the transcript is sparse.
 */
function createStudentModel(completedCourses, modelCourses) {
    const takenIds = new Set();

    for (const completed of completedCourses) {
        takenIds.add(completed.course_id);
        if (completed.substituting_course_id !== null && completed.substituting_course_id !== undefined) {
            takenIds.add(completed.substituting_course_id);
        }
    }

    // First pass: mark taken based on transcript alone.
    const result = modelCourses.map(course => ({
        ...course,
        taken: takenIds.has(course.course_id)
    }));

    // Second pass: positional lab inference.
    // A course is a "positional lab" if:
    //   - its course_id ends in 'L',
    //   - it has NO explicit corequisite_code (string empty / array empty / missing),
    //   - and a course with its id minus the trailing 'L' exists in the model.
    // If the parent is taken, mark the lab taken too.
    for (const course of result) {
        if (course.taken) continue;
        if (!course.course_id || !course.course_id.endsWith('L')) continue;

        // Skip if this lab has an explicit corequisite_code field.
        const explicit = course.corequisite_code;
        const hasExplicit = Array.isArray(explicit)
            ? explicit.length > 0
            : (typeof explicit === 'string' && explicit.length > 0);
        if (hasExplicit) continue;

        const parentId = course.course_id.slice(0, -1);
        const parent = result.find(c => c.course_id === parentId);
        if (!parent) continue;
        if (!parent.taken) continue;

        // Skip if parent has an explicit corequisite_code — the pairing is
        // being managed explicitly, so don't layer positional logic on top.
        const parentExplicit = parent.corequisite_code;
        const parentHasExplicit = Array.isArray(parentExplicit)
            ? parentExplicit.length > 0
            : (typeof parentExplicit === 'string' && parentExplicit.length > 0);
        if (parentHasExplicit) continue;

        course.taken = true;
    }

    return result;
}


/**
 * FUNCTION 2 — updateTerm
 *
 * Advances a term code (YYT: YY year, T = 1 Fall / 2 Spring / 3 Summer).
 *   Fall/Spring: +1
 *   Summer:      +8 (jumps to next year's Fall)
 */
function updateTerm(currentTerm) {
    let termNumber = parseInt(currentTerm, 10);
    const termDigit = termNumber % 10;

    if (termDigit === 1 || termDigit === 2) {
        termNumber += 1;
    } else {
        termNumber += 8;
    }

    const result = String(termNumber);
    return result.length === 2 ? '0' + result : result;
}


/** FUNCTION 3 — isSummerTerm */
function isSummerTerm(termCode) {
    return parseInt(termCode, 10) % 10 === 3;
}


/**
 * FUNCTION 4 — computeCourseLevels
 *
 * Derives each course's level from its prerequisite chain.
 * Memoized; cycles default to level 1 with a warning.
 */
function computeCourseLevels(modelCourses) {
    const byId = new Map(modelCourses.map(c => [c.course_id, c]));
    const levels = new Map();
    const visiting = new Set();

    function levelOf(courseId) {
        if (levels.has(courseId)) return levels.get(courseId);

        const course = byId.get(courseId);
        if (!course) { levels.set(courseId, 1); return 1; }

        if (visiting.has(courseId)) {
            console.warn(`WARNING: prerequisite cycle detected at course ${courseId}. Treating as level 1.`);
            levels.set(courseId, 1);
            return 1;
        }

        const prereqs = course.prerequisites || [];
        if (prereqs.length === 0) { levels.set(courseId, 1); return 1; }

        visiting.add(courseId);
        const maxPrereqLevel = Math.max(...prereqs.map(levelOf));
        visiting.delete(courseId);

        const lvl = maxPrereqLevel + 1;
        levels.set(courseId, lvl);
        return lvl;
    }

    for (const course of modelCourses) levelOf(course.course_id);
    return levels;
}


/**
 * FUNCTION 5 — prerequisitesSatisfied
 *
 * True if every prereq of `course` is either taken or a level-1 course
 * scheduled earlier this semester.
 */
function prerequisitesSatisfied(course, takenIds, scheduledThisSemester, courseLevels) {
    const prereqs = course.prerequisites;
    if (!prereqs || prereqs.length === 0) return true;

    for (const prereqId of prereqs) {
        if (takenIds.has(prereqId)) continue;

        const prereqLevel = courseLevels.get(prereqId) ?? 1;
        if (prereqLevel === 1 && scheduledThisSemester.has(prereqId)) continue;

        return false;
    }
    return true;
}


/**
 * FUNCTION 6 — buildCoreqGraph
 *
 * Builds a SYMMETRIC undirected adjacency map of corequisite relationships.
 *
 * Corequisites are symmetric: if A lists B as a coreq, both A and B must
 * be scheduled in the same semester. B cannot be scheduled alone, even if
 * B's own corequisite_code field doesn't mention A. The reverse edge is
 * inferred here at setup time.
 *
 * Also folds in the positional lab-companion fallback: if a course has NO
 * explicit corequisite_code AND the next model entry (by priority order)
 * has course_id = this course's id + 'L', they're joined.
 *
 * @param {Array} model       Sorted model array.
 * @param {Map}   modelById   course_id -> course ref.
 * @returns {Map}  course_id -> Set of directly-adjacent coreq course_ids.
 */
function buildCoreqGraph(model, modelById) {
    const graph = new Map();
    for (const c of model) graph.set(c.course_id, new Set());

    function addEdge(aId, bId) {
        if (aId === bId) return;
        if (!graph.has(aId) || !graph.has(bId)) return;
        graph.get(aId).add(bId);
        graph.get(bId).add(aId); // symmetric inference
    }

    for (const course of model) {
        const explicit = coreqsOf(course);

        if (explicit.length > 0) {
            for (const coreqId of explicit) {
                if (!modelById.has(coreqId)) {
                    console.warn(`WARNING: corequisite_code references unknown course ${coreqId} (from ${course.course_id}).`);
                    continue;
                }
                addEdge(course.course_id, coreqId);
            }
        } else {
            // Positional lab fallback — only when no explicit coreq field.
            const idx = model.indexOf(course);
            const next = (idx >= 0) ? model[idx + 1] : null;
            if (next && isLabCompanionOf(course, next)) {
                addEdge(course.course_id, next.course_id);
            }
        }
    }

    return graph;
}


/**
 * FUNCTION 7 — resolveCoreqGroup
 *
 * Returns every course transitively connected to `seed` in the coreq graph,
 * filtered to courses that are not yet taken, in model (priority) order.
 *
 * @param {Object} seed       Model course to start from.
 * @param {Array}  model      The sorted model array.
 * @param {Map}    modelById  course_id -> course ref.
 * @param {Map}    coreqGraph course_id -> Set of adjacent course_ids.
 * @returns {Array}  Unplaced courses in the group, in model order.
 */
function resolveCoreqGroup(seed, model, modelById, coreqGraph) {
    const groupIds = new Set();
    const queue = [seed.course_id];

    while (queue.length > 0) {
        const id = queue.shift();
        if (groupIds.has(id)) continue;
        groupIds.add(id);

        const neighbors = coreqGraph.get(id);
        if (!neighbors) continue;
        for (const nbrId of neighbors) {
            if (!groupIds.has(nbrId)) queue.push(nbrId);
        }
    }

    // Return in model-order; filter out already-taken members.
    return model.filter(c => groupIds.has(c.course_id) && !c.taken);
}


/**
 * FUNCTION 8 — collectTransitivePrereqs
 *
 * Given a set of course_ids (the blocked group), returns the set of all
 * course_ids that appear transitively in their prerequisites chains.
 *
 * Walks the prerequisites graph depth-first. Only course_ids that exist in
 * the model contribute further prereqs (external transcript prereqs are
 * included as endpoints but can't be walked further).
 *
 * @param {Iterable<string>} seedIds   Starting course_ids (blocked group).
 * @param {Map} modelById              course_id -> model course ref.
 * @returns {Set<string>}  All course_ids on the prereq chain(s), excluding
 *   the seed ids themselves (which are the blocked courses, not prereqs).
 */
function collectTransitivePrereqs(seedIds, modelById) {
    const result = new Set();
    const stack = [];

    // Initialize with direct prereqs of seeds.
    for (const id of seedIds) {
        const course = modelById.get(id);
        if (!course) continue;
        const prereqs = course.prerequisites || [];
        for (const p of prereqs) stack.push(p);
    }

    while (stack.length > 0) {
        const id = stack.pop();
        if (result.has(id)) continue;
        result.add(id);

        const course = modelById.get(id);
        if (!course) continue;
        const prereqs = course.prerequisites || [];
        for (const p of prereqs) {
            if (!result.has(p)) stack.push(p);
        }
    }

    return result;
}


/**
 * FUNCTION 9 — createPlan  (THE MAIN ALGORITHM)
 *
 * @param {Array}  completedCourses  Transcript rows.
 *   { course_id, substituting_course_id }
 *
 * @param {Array}  modelCourses  Program model rows (need not be pre-sorted).
 *   { course_id, priority_index, prerequisites, credits?, corequisite_code? }
 *
 * @param {Object} student
 *   - starting_term: string (e.g., "241")
 *   - credits_per_semester: number
 *   - include_summer: boolean
 *
 * @param {Object} degreeModel
 *   - total_credits_required: number
 *
 * @param {number} [creditBuffer=2]  Tolerance in credits. Defaults to 2 when
 *   not passed, which accommodates a lab or one heavy-credit course.
 *
 * @returns {Array}  Plan entries.
 *   Real:      { course_id, semester_number, term_code, credits }
 *   Elective:  { course_id: null, placeholder: 'Student Elective',
 *                semester_number, term_code, credits }
 */
function createPlan(completedCourses, modelCourses, student, degreeModel, creditBuffer) {
    if (typeof creditBuffer !== 'number' || creditBuffer < 0) {
        creditBuffer = DEFAULT_CREDIT_BUFFER;
    }

    // --- Setup --------------------------------------------------------------

    const model = createStudentModel(completedCourses, modelCourses)
        .slice()
        .sort((a, b) => a.priority_index - b.priority_index);

    const modelById = new Map(model.map(c => [c.course_id, c]));
    const courseLevels = computeCourseLevels(model);

    // Build the symmetric coreq graph once.
    const coreqGraph = buildCoreqGraph(model, modelById);

    // Running set of "done" course_ids for prereq checks. Includes taken
    // model courses AND every raw transcript entry (external transfers
    // satisfy prereqs but don't count toward the program total).
    const takenIds = new Set(model.filter(c => c.taken).map(c => c.course_id));
    for (const completed of completedCourses) {
        takenIds.add(completed.course_id);
        if (completed.substituting_course_id !== null && completed.substituting_course_id !== undefined) {
            takenIds.add(completed.substituting_course_id);
        }
    }

    // Credit accounting: only model courses count toward the program total.
    let creditsAccrued = 0;
    for (const course of model) {
        if (course.taken) creditsAccrued += creditsOf(course);
    }

    const totalCreditsRequired =
        (degreeModel && typeof degreeModel.total_credits_required === 'number')
            ? degreeModel.total_credits_required
            : null;

    let remainingRequired = model.filter(c => !c.taken).length;
    let semester = 0;
    let currentTerm = student.starting_term;
    const plan = [];

    const MAX_SEMESTERS = 100;

    function isComplete() {
        if (remainingRequired > 0) return false;
        if (totalCreditsRequired === null) return true;
        return creditsAccrued >= totalCreditsRequired;
    }

    // --- Main loop ----------------------------------------------------------

    while (!isComplete() && semester < MAX_SEMESTERS) {
        semester += 1;

        // Summer opt-out.
        if (isSummerTerm(currentTerm) && student.include_summer === false) {
            currentTerm = updateTerm(currentTerm);
            continue;
        }

        let semesterCredits = 0;
        const scheduledThisSemester = new Set();
        let placedRealThisSemester = 0;

        // --- Phase 1: hybrid strict-priority walk through required courses
        //
        // Walk in priority_index order. Normally this is strict: the first
        // course (or coreq group) that can't be placed stops the walk.
        //
        // HYBRID EXCEPTION: when a group is blocked (either by overflow or
        // unmet prereqs), we DON'T stop. Instead, we record the course_ids
        // on that blocked group's prerequisite chain (transitive) as an
        // allow-list, and keep walking. From that point on we only place
        // courses whose course_id is in the allow-list. This lets lower-
        // priority prereqs get placed this semester so they can unblock
        // the group next semester.
        //
        // If we hit a SECOND blocked group while in allow-list mode, its
        // prereq chain is merged into the allow-list (so its own prereqs
        // can still be placed). Non-prereq, non-blocker courses are still
        // skipped.
        //
        // Coreq groups are atomic: all-fit-or-all-defer.

        if (remainingRequired > 0) {
            // Allow-list of course_ids placeable after the first block.
            // null = not yet in restricted mode (strict priority).
            let allowList = null;

            for (let i = 0; i < model.length; i++) {
                const course = model[i];
                if (course.taken) continue;

                // In restricted mode, skip anything not in the allow-list.
                if (allowList !== null && !allowList.has(course.course_id)) {
                    continue;
                }

                // Resolve the symmetric coreq group (already excludes taken).
                const unplacedGroup = resolveCoreqGroup(course, model, modelById, coreqGraph);
                if (unplacedGroup.length === 0) continue;

                // Sum credits for the whole group.
                const groupCost = unplacedGroup.reduce((s, c) => s + creditsOf(c), 0);

                // --- Capacity check ---
                if (semesterCredits + groupCost > student.credits_per_semester + creditBuffer) {
                    // Blocked by overflow. Enter/extend restricted mode:
                    // allow only courses on this group's prereq chain.
                    const chain = collectTransitivePrereqs(
                        unplacedGroup.map(c => c.course_id),
                        modelById
                    );
                    if (allowList === null) allowList = new Set();
                    for (const id of chain) allowList.add(id);
                    continue;
                }

                // --- Prereq check (treat all group members as co-scheduled) ---
                const hypotheticalScheduled = new Set(scheduledThisSemester);
                for (const m of unplacedGroup) hypotheticalScheduled.add(m.course_id);

                let allPrereqsOk = true;
                for (const member of unplacedGroup) {
                    if (!prerequisitesSatisfied(member, takenIds, hypotheticalScheduled, courseLevels)) {
                        allPrereqsOk = false;
                        break;
                    }
                }
                if (!allPrereqsOk) {
                    // Blocked by prereq. Enter/extend restricted mode.
                    const chain = collectTransitivePrereqs(
                        unplacedGroup.map(c => c.course_id),
                        modelById
                    );
                    if (allowList === null) allowList = new Set();
                    for (const id of chain) allowList.add(id);
                    continue;
                }

                // --- Place every member of the group ---
                for (const member of unplacedGroup) {
                    const cost = creditsOf(member);
                    plan.push({
                        course_id: member.course_id,
                        semester_number: semester,
                        term_code: currentTerm,
                        credits: cost
                    });
                    semesterCredits += cost;
                    placedRealThisSemester += 1;
                    member.taken = true;
                    scheduledThisSemester.add(member.course_id);
                    remainingRequired -= 1;
                    creditsAccrued += cost;
                }
            }

            // Freeze this semester's placements for future prereq checks.
            for (const id of scheduledThisSemester) takenIds.add(id);
        }

        // --- Phase 2: fill with Student Elective rows ---------------------
        //
        // Electives use the HARD cap (no buffer). Buffer is for real courses
        // where a heavy-credit load is worth the overload; it shouldn't be
        // spent on filler.
        while (semesterCredits + ELECTIVE_CREDITS <= student.credits_per_semester) {
            if (totalCreditsRequired !== null &&
                creditsAccrued + ELECTIVE_CREDITS > totalCreditsRequired) break;
            if (totalCreditsRequired === null && remainingRequired === 0) break;

            plan.push({
                course_id: null,
                placeholder: 'Student Elective',
                semester_number: semester,
                term_code: currentTerm,
                credits: ELECTIVE_CREDITS
            });
            semesterCredits += ELECTIVE_CREDITS;
            creditsAccrued += ELECTIVE_CREDITS;
        }

        // Deadlock guard.
        if (placedRealThisSemester === 0 && semesterCredits === 0 && !isComplete()) {
            console.warn('WARNING: createPlan could not place any course this semester. Remaining courses have unsatisfied prerequisites or credit geometry is unworkable. Stopping.');
            break;
        }

        currentTerm = updateTerm(currentTerm);
    }

    if (semester >= MAX_SEMESTERS) {
        console.warn('WARNING: createPlan hit the 100-semester safety limit. Check your model data.');
    }

    return plan;
}


module.exports = {
    createStudentModel,
    updateTerm,
    isSummerTerm,
    computeCourseLevels,
    prerequisitesSatisfied,
    isLabCompanionOf,
    coreqsOf,
    buildCoreqGraph,
    resolveCoreqGroup,
    collectTransitivePrereqs,
    createPlan
};
