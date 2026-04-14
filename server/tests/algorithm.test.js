// =============================================================================
// algorithm.test.js
// Verification tests for the Expert Advisor scheduling algorithm.
//
// Run with:  node tests/algorithm.test.js
//
// If the algorithm is correct, you will see:
//   ✓  All unit tests passed.
//   ✓  Full plan matches expected output.
//   ✓  All tests passed!
//
// If any test fails, the script will print exactly which assertion failed
// and exit with a non-zero code.
// =============================================================================

const assert = require('assert');
const { createStudentModel, compareCombination, updateTerm, createPlan } = require('../algorithm/planAlgorithm');


// -----------------------------------------------------------------------------
// PART 1 — Unit tests for updateTerm
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
// PART 2 — Unit tests for compareCombination
// -----------------------------------------------------------------------------

assert.strictEqual(compareCombination('1',     1), true,  'Level 1 is in "1"');
assert.strictEqual(compareCombination('1',     2), false, 'Level 2 is NOT in "1"');
assert.strictEqual(compareCombination('2',     1), false, 'Level 1 is NOT in "2"');
assert.strictEqual(compareCombination('2',     2), true,  'Level 2 is in "2"');
assert.strictEqual(compareCombination('3',     2), false, 'Level 2 is NOT in "3"');
assert.strictEqual(compareCombination('3',     3), true,  'Level 3 is in "3"');
assert.strictEqual(compareCombination('1;2;3', 1), true,  'Level 1 is in "1;2;3"');
assert.strictEqual(compareCombination('1;2;3', 2), true,  'Level 2 is in "1;2;3"');
assert.strictEqual(compareCombination('1;2;3', 3), true,  'Level 3 is in "1;2;3"');
assert.strictEqual(compareCombination('2;3',   1), false, 'Level 1 is NOT in "2;3"');
assert.strictEqual(compareCombination('2;3',   2), true,  'Level 2 is in "2;3"');
assert.strictEqual(compareCombination('2;3',   3), true,  'Level 3 is in "2;3"');

console.log('✓  compareCombination: all cases correct.');


// -----------------------------------------------------------------------------
// PART 3 — Integration test: full plan from the sample CAI degree model
//
// This is the authoritative test. The expected output below was hand-traced
// using the pseudocode in ExpertStudentAdviosrPrompt.txt.
//
// Input:
//   - CAI degree program (17 courses, see below)
//   - Student has already completed 5 courses:
//       CAI1001C (id 1), COP1047C (id 3), MAC1105 (id 4),
//       STA2023 (id 13), POS2041 (id 16)
//   - CoursesPerSemester: 3
//   - StartingTerm: "241" (Fall 2024)
//
// Expected output:
//   Semester 1 (241 / Fall 2024):    CGS1060C (id 2)
//   Semester 2 (242 / Spring 2025):  CAI2100C (id 5), PHI2680 (id 6), CGS1540C (id 7)
//   Semester 3 (243 / Summer 2025):  CAI2300C (id 8), CAI2840C (id 9), CTS1145 (id 10)
//   Semester 4 (251 / Fall 2025):    CAI2820C (id 11)
//   Semester 5 (252 / Spring 2026):  COP2800 (id 12), ENC1101 (id 14), HUM1020 (id 15)
//   Semester 6 (253 / Summer 2026):  CHM1020 (id 17)
// -----------------------------------------------------------------------------

// The full 17-course CAI model in priority order.
// course_id numbers match priority_index for simplicity in this test.
const CAI_MODEL = [
    { course_id: 1,  priority_index: 1,  levels: '1'     },  // CAI1001C
    { course_id: 2,  priority_index: 2,  levels: '1;2;3' },  // CGS1060C
    { course_id: 3,  priority_index: 3,  levels: '1'     },  // COP1047C
    { course_id: 4,  priority_index: 4,  levels: '1'     },  // MAC1105
    { course_id: 5,  priority_index: 5,  levels: '2'     },  // CAI2100C
    { course_id: 6,  priority_index: 6,  levels: '1;2;3' },  // PHI2680
    { course_id: 7,  priority_index: 7,  levels: '1;2;3' },  // CGS1540C
    { course_id: 8,  priority_index: 8,  levels: '2'     },  // CAI2300C
    { course_id: 9,  priority_index: 9,  levels: '2'     },  // CAI2840C
    { course_id: 10, priority_index: 10, levels: '2'     },  // CTS1145
    { course_id: 11, priority_index: 11, levels: '1;2;3' },  // CAI2820C
    { course_id: 12, priority_index: 12, levels: '3'     },  // COP2800
    { course_id: 13, priority_index: 13, levels: '2;3'   },  // STA2023
    { course_id: 14, priority_index: 14, levels: '1;2;3' },  // ENC1101
    { course_id: 15, priority_index: 15, levels: '1;2;3' },  // HUM1020
    { course_id: 16, priority_index: 16, levels: '1;2;3' },  // POS2041
    { course_id: 17, priority_index: 17, levels: '2;3'   },  // CHM1020
];

// The 5 courses this student has already completed.
const COMPLETED = [
    { course_id: 1,  substituting_course_id: null },  // CAI1001C
    { course_id: 3,  substituting_course_id: null },  // COP1047C
    { course_id: 4,  substituting_course_id: null },  // MAC1105
    { course_id: 13, substituting_course_id: null },  // STA2023
    { course_id: 16, substituting_course_id: null },  // POS2041
];

const STUDENT = {
    starting_term: '241',
    courses_per_semester: 3
};

const plan = createPlan(COMPLETED, CAI_MODEL, STUDENT);

// Helper: get all course_ids scheduled in a given semester number.
function coursesInSemester(semNum) {
    return plan.filter(p => p.semester_number === semNum).map(p => p.course_id);
}

// Helper: get the term code for a given semester number.
function termOfSemester(semNum) {
    const entry = plan.find(p => p.semester_number === semNum);
    return entry ? entry.term_code : null;
}

// Total courses scheduled should be 12 (17 in model minus 5 completed).
assert.strictEqual(plan.length, 12, `Total scheduled courses should be 12, got ${plan.length}`);

// Semester 1 — Fall 2024 — only CGS1060C (id 2)
assert.strictEqual(termOfSemester(1), '241', 'Semester 1 term code should be 241');
assert.deepStrictEqual(coursesInSemester(1), [2], 'Semester 1 should contain only CGS1060C (id 2)');

// Semester 2 — Spring 2025 — CAI2100C, PHI2680, CGS1540C
assert.strictEqual(termOfSemester(2), '242', 'Semester 2 term code should be 242');
assert.deepStrictEqual(coursesInSemester(2), [5, 6, 7], 'Semester 2 should contain ids 5, 6, 7');

// Semester 3 — Summer 2025 — CAI2300C, CAI2840C, CTS1145
assert.strictEqual(termOfSemester(3), '243', 'Semester 3 term code should be 243');
assert.deepStrictEqual(coursesInSemester(3), [8, 9, 10], 'Semester 3 should contain ids 8, 9, 10');

// Semester 4 — Fall 2025 — only CAI2820C
assert.strictEqual(termOfSemester(4), '251', 'Semester 4 term code should be 251');
assert.deepStrictEqual(coursesInSemester(4), [11], 'Semester 4 should contain only CAI2820C (id 11)');

// Semester 5 — Spring 2026 — COP2800, ENC1101, HUM1020
assert.strictEqual(termOfSemester(5), '252', 'Semester 5 term code should be 252');
assert.deepStrictEqual(coursesInSemester(5), [12, 14, 15], 'Semester 5 should contain ids 12, 14, 15');

// Semester 6 — Summer 2026 — only CHM1020
assert.strictEqual(termOfSemester(6), '253', 'Semester 6 term code should be 253');
assert.deepStrictEqual(coursesInSemester(6), [17], 'Semester 6 should contain only CHM1020 (id 17)');

// There should be exactly 6 semesters total.
const semesterNumbers = [...new Set(plan.map(p => p.semester_number))];
assert.strictEqual(semesterNumbers.length, 6, `Plan should span exactly 6 semesters, got ${semesterNumbers.length}`);

console.log('✓  Full plan matches expected output.');
console.log('');
console.log('✓  All tests passed!');
console.log('');
console.log('  Semester breakdown:');
for (let s = 1; s <= 6; s++) {
    const ids = coursesInSemester(s);
    const term = termOfSemester(s);
    console.log(`    Semester ${s} (${term}): course ids [${ids.join(', ')}]`);
}
