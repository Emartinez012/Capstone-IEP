// =============================================================================
// planAlgorithm.js
// Expert Advisor — Core Scheduling Algorithm
//
// This file is a direct translation of the pseudocode in:
//   ExpertStudentAdviosrPrompt.txt  (Student Advising Program version 3)
//
// DO NOT change the logic of these functions without verifying the test suite
// still passes. The algorithm behavior must remain identical to the original.
// =============================================================================


/**
 * FUNCTION 1 — createStudentModel
 *
 * Marks each course in the degree model as "taken" or "not taken" based on
 * the student's transcript. Also handles substitutions: if a student completed
 * course X as a substitute for model course Y, Y is marked as taken.
 *
 * @param {Array} completedCourses  Rows from the completed_courses table.
 *   Each object must have: { course_id, substituting_course_id }
 *   substituting_course_id should be null if no substitution applies.
 *
 * @param {Array} modelCourses  Rows from the model_courses table,
 *   ordered by priority_index ASC (lowest number = highest priority).
 *   Each object must have: { course_id, priority_index, levels }
 *
 * @returns {Array}  A copy of modelCourses with a `taken` boolean on each item.
 */
function createStudentModel(completedCourses, modelCourses) {
    // Build a set of every course ID the student has credit for.
    // This includes courses they completed directly AND any model course
    // that one of their completed courses was a substitution for.
    const takenIds = new Set();

    for (const completed of completedCourses) {
        takenIds.add(completed.course_id);
        if (completed.substituting_course_id !== null && completed.substituting_course_id !== undefined) {
            takenIds.add(completed.substituting_course_id);
        }
    }

    // Return a new array so we don't mutate the original modelCourses input.
    return modelCourses.map(course => ({
        ...course,
        taken: takenIds.has(course.course_id)
    }));
}


/**
 * FUNCTION 2 — compareCombination
 *
 * Returns true if the current level is one of the course's allowed levels.
 *
 * The `levels` string uses semicolons to separate allowed levels, e.g.:
 *   "1"      — only allowed at level 1
 *   "2"      — only allowed at level 2
 *   "1;2;3"  — allowed at levels 1, 2, or 3
 *   "2;3"    — allowed at levels 2 or 3
 *
 * @param {string} courseLevels  The levels string from the model_courses table.
 * @param {number} currentLevel  The algorithm's current level counter (starts at 1).
 * @returns {boolean}
 */
function compareCombination(courseLevels, currentLevel) {
    const allowedLevels = courseLevels.split(';').map(Number);
    return allowedLevels.includes(currentLevel);
}


/**
 * FUNCTION 3 — updateTerm
 *
 * Advances a term code to the next semester.
 *
 * Term code format: YYT
 *   YY = last two digits of the academic year (e.g., 24 for 2024)
 *   T  = term within that year (1 = Fall, 2 = Spring, 3 = Summer)
 *
 * Rules (from the original VB.NET implementation):
 *   - If the term digit is 1 (Fall) or 2 (Spring): add 1
 *   - If the term digit is 3 (Summer): add 8 (jumps to the next year's Fall)
 *
 * Examples:
 *   "241" (Fall 2024)   → "242" (Spring 2025)
 *   "242" (Spring 2025) → "243" (Summer 2025)
 *   "243" (Summer 2025) → "251" (Fall 2025)
 *   "251" (Fall 2025)   → "252" (Spring 2026)
 *
 * @param {string} currentTerm  The current term code as a string (e.g., "241").
 * @returns {string}  The next term code as a string.
 */
function updateTerm(currentTerm) {
    let termNumber = parseInt(currentTerm, 10);
    const termDigit = termNumber % 10; // last digit = term within year

    if (termDigit === 1 || termDigit === 2) {
        termNumber += 1;
    } else {
        // termDigit === 3 (Summer) → jump to next year's Fall
        termNumber += 8;
    }

    // Preserve leading zero for old-format codes (e.g., 92 → "092").
    // Not needed for 2023+ terms but kept for correctness.
    const result = String(termNumber);
    return result.length === 2 ? '0' + result : result;
}


/**
 * FUNCTION 4 — createPlan  (THE MAIN ALGORITHM)
 *
 * Generates a semester-by-semester course schedule for a student.
 *
 * This is a direct translation of the pseudocode in ExpertStudentAdviosrPrompt.txt.
 * The critical behavior: when the algorithm finds a course it cannot place at the
 * current level, it ENDS THE SEMESTER IMMEDIATELY and permanently advances the level.
 * This creates the natural level-by-level progression through the degree.
 *
 * @param {Array} completedCourses  The student's transcript (same format as
 *   createStudentModel's first parameter).
 *
 * @param {Array} modelCourses  Program model rows ordered by priority_index ASC.
 *   Each object must have: { course_id, priority_index, levels }
 *
 * @param {Object} student  Student preferences.
 *   Must have: { starting_term: string, courses_per_semester: number }
 *
 * @returns {Array}  Plan entries: [{ course_id, semester_number, term_code }, ...]
 *   One entry per course that still needs to be taken.
 *   Courses already completed are NOT included in the output.
 */
function createPlan(completedCourses, modelCourses, student) {
    // Step 1: Mark which courses the student has already completed.
    const model = createStudentModel(completedCourses, modelCourses);

    // Step 2: Count how many courses still need to be scheduled.
    let remaining = model.filter(c => !c.taken).length;

    // Step 3: Initialize tracking variables.
    let semester = 0;
    let currentLevel = 1;
    let currentTerm = student.starting_term;
    const plan = [];

    // Safety guard: prevent infinite loops if a course's levels can never be reached.
    const MAX_SEMESTERS = 100;

    // Step 4: Main loop — keep going until every course is placed.
    while (remaining > 0 && semester < MAX_SEMESTERS) {
        semester += 1;
        let counter = 0;

        for (const course of model) {
            // Stop adding courses once this semester is full.
            if (counter >= student.courses_per_semester) break;

            // Skip courses already completed or already scheduled.
            if (course.taken) continue;

            if (compareCombination(course.levels, currentLevel)) {
                // This course is eligible at the current level — schedule it.
                plan.push({
                    course_id: course.course_id,
                    semester_number: semester,
                    term_code: currentTerm
                });
                counter += 1;
                course.taken = true;  // mark so it isn't scheduled again
                remaining -= 1;

            } else {
                // CRITICAL BRANCH (from pseudocode):
                // This course exists but its level is higher than where we are now.
                // End the semester immediately and advance to the next level.
                // The +1 makes the loop's guard (counter >= courses_per_semester) fire
                // on the very next iteration, breaking out of the for loop.
                currentLevel += 1;
                counter = student.courses_per_semester + 1;
            }
        }

        // Advance the term code for the next semester.
        currentTerm = updateTerm(currentTerm);
    }

    if (semester >= MAX_SEMESTERS) {
        console.warn('WARNING: createPlan hit the 100-semester safety limit. Check your model data for courses with unreachable levels.');
    }

    return plan;
}


module.exports = { createStudentModel, compareCombination, updateTerm, createPlan };
