// =============================================================================
// algorithm/planAlgorithm.js - POSTGRESQL NATIVE (Prerequisite & Priority Based)
// =============================================================================

/**
 * Safely evaluates a boolean prerequisite string against the courses a student has completed.
 * @param {String} prereqStr - e.g., "(MAC1106 AND MAC1114) OR MAC1147"
 * @param {Set} completedSet - Set of completed course codes
 * @returns {Boolean} - True if prerequisites are met, false otherwise
 */
function checkPrerequisites(prereqStr, completedSet) {
    if (!prereqStr || prereqStr.trim() === '') return true; // No prerequisites needed

    // 1. Replace course codes with 'true' or 'false' based on the completed Set
    // Regex matches standard Florida course codes (e.g., MAC1105, CGS1060C)
    let expr = prereqStr.replace(/[A-Z]{3}\d{4}[A-Z]?/g, match => {
        return completedSet.has(match) ? 'true' : 'false';
    });

    // 2. Convert SQL/Text boolean operators to JavaScript operators
    expr = expr.replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||');

    // 3. Evaluate the boolean expression safely
    try {
        return new Function(`return ${expr};`)();
    } catch (error) {
        console.error(`Error evaluating prerequisite string: ${prereqStr}`, error);
        return false;
    }
}

/**
 * Generates an academic plan.
 * @param {Object} student - { id, target_credits, opt_out_summer, starting_term }
 * @param {Array} history - Array of { course_code } that the student has passed/transferred
 * @param {Array} model - Array of { course_code, priority_value, credits, prerequisite_codes }
 * @returns {Array} - Array of { course_id, semester_number, term_code }
 */
function createPlan(student, history, model) {
    // 1. Flatten history into a Set. This instantly handles returning/transfer students!
    const completedSet = new Set(history.map(h => h.course_code || h.course_id));

    // 2. Filter out courses the student has already passed
    let remainingCourses = model.filter(course => !completedSet.has(course.course_code));

    const plan = [];
    let currentSemesterNum = 1;
    let currentTermCode = student.starting_term || '241'; // e.g., Fall 2024
    const targetCredits = student.target_credits || 12;

    // 3. Simulate semesters sequentially to resolve prerequisite chains
    while (remainingCourses.length > 0) {
        // Find all courses where the prerequisites are satisfied by the CURRENT completedSet
        let availableCourses = remainingCourses.filter(course => 
            checkPrerequisites(course.prerequisite_codes, completedSet)
        );

        // INFINITE LOOP PROTECTION: If no courses are unlocked but we still have remaining courses, 
        // a prerequisite is missing from the curriculum or a chain is broken.
        if (availableCourses.length === 0) {
            console.warn(`Academic Plan halted! Unmet prerequisites for remaining courses:`, remainingCourses.map(c => c.course_code));
            break; 
        }

        // Sort available courses by priority (Lower number = Higher Priority)
        // You can secondary sort by credits if needed
        availableCourses.sort((a, b) => (a.priority_value || 1) - (b.priority_value || 1));

        let currentSemesterCredits = 0;
        let scheduledThisSemester = [];

        // 4. Pack courses into the current semester up to the target credit limit
        for (const course of availableCourses) {
            const courseCredits = course.credits || 3;

            if (currentSemesterCredits + courseCredits <= targetCredits) {
                scheduledThisSemester.push(course);
                currentSemesterCredits += courseCredits;
                
                // Add to plan output
                plan.push({
                    course_id: course.course_code,
                    course_code: course.course_code,
                    semester_number: currentSemesterNum,
                    term_code: currentTermCode,
                    credits: courseCredits
                });
            }
        }

        // 5. Update state for the *next* semester iteration
        // Virtually "pass" the scheduled courses to unlock next tier of prerequisites
        scheduledThisSemester.forEach(c => {
            completedSet.add(c.course_code);
            remainingCourses = remainingCourses.filter(rem => rem.course_code !== c.course_code);
        });

        // Advance to the next term and semester number
        currentSemesterNum++;
        currentTermCode = advanceTerm(currentTermCode, student.opt_out_summer);
    }

    return plan;
}

/**
 * Advances a term code to the next semester.
 * Term format: YYT (e.g., 241 = Fall 2024, 242 = Spring 2025, 243 = Summer 2025)
 */
function advanceTerm(currentTerm, optOutSummer) {
    let year = parseInt(currentTerm.substring(0, 2), 10);
    let term = parseInt(currentTerm.substring(2, 3), 10);

    term++;

    // If it hits Summer (3) and student opted out, skip to Fall (1) of next year
    if (term === 3 && optOutSummer) {
        term = 1;
        year++;
    } 
    // If it rolls past Summer (3), go to Fall (1) of next year
    else if (term > 3) {
        term = 1;
        year++;
    }

    return `${year}${term}`;
}

module.exports = { createPlan, checkPrerequisites, advanceTerm };