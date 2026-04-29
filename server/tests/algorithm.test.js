// =============================================================================
// algorithm.test.js
// Unit and integration tests for planAlgorithm.js.
//
// Run with:  node tests/algorithm.test.js
// =============================================================================

const assert = require('assert');
const {
    updateTerm,
    computeCourseLevels,
    prerequisitesSatisfied,
    createPlan,
} = require('../algorithm/planAlgorithm');


// -----------------------------------------------------------------------------
// PART 1 — updateTerm
// -----------------------------------------------------------------------------

assert.strictEqual(updateTerm('241'), '242', 'Fall 2024  → Spring 2025');
assert.strictEqual(updateTerm('242'), '243', 'Spring 2025 → Summer 2025');
assert.strictEqual(updateTerm('243'), '251', 'Summer 2025 → Fall 2025');
assert.strictEqual(updateTerm('251'), '252', 'Fall 2025  → Spring 2026');
assert.strictEqual(updateTerm('252'), '253', 'Spring 2026 → Summer 2026');
assert.strictEqual(updateTerm('253'), '261', 'Summer 2026 → Fall 2026');
assert.strictEqual(updateTerm('231'), '232', 'Fall 2023  → Spring 2024');

console.log('✓  updateTerm: all cases correct.');


// -----------------------------------------------------------------------------
// PART 2 — computeCourseLevels
//
// Level rules:
//   level 1 = no prerequisites
//   level N = 1 + max level of all prerequisites
// -----------------------------------------------------------------------------

const LEVEL_MODEL = [
    { course_id: 'A', prerequisites: []          },  // level 1 — no prereqs
    { course_id: 'B', prerequisites: ['A']        },  // level 2 — needs A
    { course_id: 'C', prerequisites: []          },  // level 1 — no prereqs
    { course_id: 'D', prerequisites: ['B']        },  // level 3 — needs B
    { course_id: 'E', prerequisites: ['A', 'C']  },  // level 2 — max(1,1)+1
    { course_id: 'F', prerequisites: ['D', 'E']  },  // level 4 — max(3,2)+1
];

const levels = computeCourseLevels(LEVEL_MODEL);

assert.strictEqual(levels.get('A'), 1, 'A has no prereqs → level 1');
assert.strictEqual(levels.get('B'), 2, 'B needs A (level 1) → level 2');
assert.strictEqual(levels.get('C'), 1, 'C has no prereqs → level 1');
assert.strictEqual(levels.get('D'), 3, 'D needs B (level 2) → level 3');
assert.strictEqual(levels.get('E'), 2, 'E needs A and C (both level 1) → level 2');
assert.strictEqual(levels.get('F'), 4, 'F needs D (level 3) and E (level 2) → level 4');

console.log('✓  computeCourseLevels: all cases correct.');


// -----------------------------------------------------------------------------
// PART 3 — prerequisitesSatisfied
//
// Key rule: a level-1 prereq may be co-scheduled (same semester);
//           level-2+ prereqs must be in a strictly earlier semester.
// -----------------------------------------------------------------------------

const PREREQ_MODEL = [
    { course_id: 'A', prerequisites: []     },
    { course_id: 'B', prerequisites: ['A']  },
    { course_id: 'C', prerequisites: ['B']  },
];
const prereqLevels = computeCourseLevels(PREREQ_MODEL);

// B needs A. A is level-1 → can be co-scheduled.
// Case: A is in scheduledThisSemester, not yet in takenIds
assert.strictEqual(
    prerequisitesSatisfied(PREREQ_MODEL[1], new Set(), new Set(['A']), prereqLevels),
    true,
    'Level-1 prereq satisfied by co-scheduling'
);

// Case: A is in takenIds (prior semester)
assert.strictEqual(
    prerequisitesSatisfied(PREREQ_MODEL[1], new Set(['A']), new Set(), prereqLevels),
    true,
    'Level-1 prereq satisfied from takenIds'
);

// Case: A not yet taken or scheduled → B is blocked
assert.strictEqual(
    prerequisitesSatisfied(PREREQ_MODEL[1], new Set(), new Set(), prereqLevels),
    false,
    'Level-1 prereq not yet available → blocked'
);

// C needs B. B is level-2 → must be in a strictly earlier semester.
// Case: B is only in scheduledThisSemester (same semester) → not satisfied
assert.strictEqual(
    prerequisitesSatisfied(PREREQ_MODEL[2], new Set(['A']), new Set(['B']), prereqLevels),
    false,
    'Level-2+ prereq cannot be co-scheduled — must be in prior semester'
);

// Case: B in takenIds (prior semester) → satisfied
assert.strictEqual(
    prerequisitesSatisfied(PREREQ_MODEL[2], new Set(['A', 'B']), new Set(), prereqLevels),
    true,
    'Level-2+ prereq satisfied from prior semester (takenIds)'
);

console.log('✓  prerequisitesSatisfied: all cases correct.');


// -----------------------------------------------------------------------------
// PART 4 — createPlan (full integration)
//
// 6-course model with explicit prerequisites, 3 credits each.
// credits_per_semester = 9  (fits exactly 3 courses per semester).
// No completed courses. include_summer = true.
// total_credits_required = 18 (no electives needed).
//
// Expected schedule:
//
//   Semester 1 (241 / Fall 2024):   A, B, C
//     • A (no prereqs) is placed first.
//     • B's prereq is A (level 1) — co-scheduling allowed → placed same semester.
//     • C (no prereqs) fills the third slot.
//     • D is blocked (prereq B is level-2 — cannot co-schedule).
//
//   Semester 2 (242 / Spring 2025): D, E, F
//     • D's prereq B is now in takenIds → placed.
//     • E has no prereqs → placed.
//     • F's prereqs B and C are both in takenIds → placed.
// -----------------------------------------------------------------------------

const PLAN_MODEL = [
    { course_id: 'A', priority_index: 1, prerequisites: [],         credits: 3 },
    { course_id: 'B', priority_index: 2, prerequisites: ['A'],      credits: 3 },
    { course_id: 'C', priority_index: 3, prerequisites: [],         credits: 3 },
    { course_id: 'D', priority_index: 4, prerequisites: ['B'],      credits: 3 },
    { course_id: 'E', priority_index: 5, prerequisites: [],         credits: 3 },
    { course_id: 'F', priority_index: 6, prerequisites: ['B', 'C'], credits: 3 },
];

const STUDENT = {
    starting_term:        '241',
    credits_per_semester: 9,
    include_summer:       true,
};

const DEGREE_MODEL = { total_credits_required: 18 };

const plan = createPlan([], PLAN_MODEL, STUDENT, DEGREE_MODEL);

// Helper: course_ids placed in a given semester number (excluding electives).
function coursesIn(semNum) {
    return plan
        .filter(p => p.semester_number === semNum && p.course_id !== null)
        .map(p => p.course_id);
}

// Helper: term code for a given semester number.
function termOf(semNum) {
    const e = plan.find(p => p.semester_number === semNum);
    return e ? e.term_code : null;
}

// Exactly 6 real entries, 2 semesters.
const realEntries = plan.filter(p => p.course_id !== null);
assert.strictEqual(realEntries.length, 6, `Expected 6 real entries, got ${realEntries.length}`);

const semNums = [...new Set(plan.filter(p => p.course_id !== null).map(p => p.semester_number))];
assert.strictEqual(semNums.length, 2, `Expected 2 semesters, got ${semNums.length}`);

// Semester 1
assert.strictEqual(termOf(1), '241', 'Semester 1 should be term 241 (Fall 2024)');
assert.deepStrictEqual(
    coursesIn(1).sort(),
    ['A', 'B', 'C'],
    'Semester 1 should contain A, B, C'
);

// Semester 2
assert.strictEqual(termOf(2), '242', 'Semester 2 should be term 242 (Spring 2025)');
assert.deepStrictEqual(
    coursesIn(2).sort(),
    ['D', 'E', 'F'],
    'Semester 2 should contain D, E, F'
);

console.log('✓  createPlan integration: plan matches expected output.');
console.log('');
console.log('✓  All tests passed!');
console.log('');
console.log('  Semester breakdown:');
for (const s of [1, 2]) {
    console.log(`    Semester ${s} (${termOf(s)}): [${coursesIn(s).join(', ')}]`);
}
