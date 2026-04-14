// =============================================================================
// real-data-test.js
// Standalone algorithm test runner for real data.
//
// Run with:  node tests/real-data-test.js
//
// Reads input from:  tests/real-data-input.json
//
// To use with the professor's data:
//   1. Open real-data-input.json
//   2. Update "student" (name, starting_term, courses_per_semester)
//   3. Update "completed_courses" with the student's transcript
//   4. If the program model is different, replace "program_model"
//   5. Optionally fill in "expected_output" if you know what the result should be
//   6. Run:  node tests/real-data-test.js
// =============================================================================

const fs   = require('fs');
const path = require('path');
const { createPlan } = require('../algorithm/planAlgorithm');

// -----------------------------------------------------------------------------
// Load input file
// -----------------------------------------------------------------------------
const inputPath = path.join(__dirname, 'real-data-input.json');

if (!fs.existsSync(inputPath)) {
    console.error('\nERROR: real-data-input.json not found.');
    console.error('Expected location:', inputPath);
    process.exit(1);
}

const input = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
const { student, program_model, completed_courses, expected_output } = input;

// -----------------------------------------------------------------------------
// Validate required fields
// -----------------------------------------------------------------------------
if (!student || !student.starting_term || !student.courses_per_semester) {
    console.error('\nERROR: "student" must have "starting_term" and "courses_per_semester".');
    process.exit(1);
}
if (!program_model || program_model.length === 0) {
    console.error('\nERROR: "program_model" is empty or missing.');
    process.exit(1);
}

// -----------------------------------------------------------------------------
// Helper: convert YYT term code to a human-readable label
// Mirrors the logic in client/src/utils.js
// -----------------------------------------------------------------------------
function termCodeToLabel(termCode) {
    const code = String(termCode);
    const yy   = parseInt(code.slice(0, 2), 10);
    const t    = parseInt(code.slice(-1),   10);
    const names = { 1: 'Fall', 2: 'Spring', 3: 'Summer' };
    const year  = t === 1 ? 2000 + yy : 2000 + yy + 1;
    return `${names[t] ?? '???'} ${year}`;
}

// -----------------------------------------------------------------------------
// Prepare inputs for createPlan()
// -----------------------------------------------------------------------------
const completedForAlgo = (completed_courses || []).map(c => ({
    course_id:              c.course_id,
    substituting_course_id: c.substituting_course_id ?? null
}));

const modelForAlgo = [...program_model]
    .sort((a, b) => a.priority_index - b.priority_index)
    .map(c => ({
        course_id:      c.course_id,
        priority_index: c.priority_index,
        levels:         c.levels
    }));

// Build a lookup map: course_id → full course object (for printing names)
const courseById = {};
program_model.forEach(c => { courseById[c.course_id] = c; });

// -----------------------------------------------------------------------------
// Run the algorithm
// -----------------------------------------------------------------------------
const planEntries = createPlan(completedForAlgo, modelForAlgo, {
    starting_term:        student.starting_term,
    courses_per_semester: student.courses_per_semester
});

// Group flat plan entries into semester buckets
const semesterMap = {};
for (const entry of planEntries) {
    if (!semesterMap[entry.semester_number]) {
        semesterMap[entry.semester_number] = {
            semester_number: entry.semester_number,
            term_code:       entry.term_code,
            courses:         []
        };
    }
    semesterMap[entry.semester_number].courses.push(courseById[entry.course_id]);
}
const semesters = Object.values(semesterMap)
    .sort((a, b) => a.semester_number - b.semester_number);

// -----------------------------------------------------------------------------
// Print header summary
// -----------------------------------------------------------------------------
const LINE = '='.repeat(64);
const line = '-'.repeat(64);

console.log('\n' + LINE);
console.log('  EXPERT ADVISOR — REAL DATA TEST');
console.log(LINE);
console.log(`  Student         : ${student.name}`);
console.log(`  Starting term   : ${student.starting_term}  (${termCodeToLabel(student.starting_term)})`);
console.log(`  Courses/semester: ${student.courses_per_semester}`);
console.log(`  Courses completed (input): ${completed_courses?.length ?? 0}`);
console.log(`  Courses remaining (to schedule): ${planEntries.length}`);
console.log(`  Semesters generated: ${semesters.length}`);
console.log(LINE);

// -----------------------------------------------------------------------------
// Print the generated schedule
// -----------------------------------------------------------------------------
console.log('\n  GENERATED SCHEDULE\n');

if (semesters.length === 0) {
    console.log('  No courses remaining — student has completed all requirements!');
} else {
    for (const sem of semesters) {
        const label = termCodeToLabel(sem.term_code);
        console.log(`  Semester ${sem.semester_number} — ${label}`);
        console.log('  ' + line.slice(2));
        for (const c of sem.courses) {
            const code = (c?.code ?? 'UNKNOWN').padEnd(12);
            const name = c?.name ?? 'Unknown course';
            console.log(`    ${code}  ${name}`);
        }
        console.log('');
    }
}

// -----------------------------------------------------------------------------
// Compare against expected output (if provided)
// -----------------------------------------------------------------------------
if (!expected_output || expected_output.length === 0) {
    console.log('  (No expected output provided — review the schedule above manually.)');
    console.log('\n' + LINE + '\n');
    process.exit(0);
}

console.log(LINE);
console.log('  COMPARISON WITH EXPECTED OUTPUT\n');

let allPass = true;
const maxLen = Math.max(semesters.length, expected_output.length);

for (let i = 0; i < maxLen; i++) {
    const actual   = semesters[i];
    const expected = expected_output[i];

    if (!actual && expected) {
        console.log(`  FAIL  Semester ${i + 1}: expected but algorithm produced nothing.`);
        console.log(`        Expected: ${expected.courses.sort().join(', ')}`);
        allPass = false;
        continue;
    }
    if (actual && !expected) {
        const actualCodes = actual.courses.map(c => c?.code ?? '???').sort().join(', ');
        console.log(`  FAIL  Semester ${i + 1}: algorithm produced a semester with no expected counterpart.`);
        console.log(`        Got:      ${actualCodes}`);
        allPass = false;
        continue;
    }

    const actualCodes   = actual.courses.map(c => c?.code ?? '???').sort();
    const expectedCodes = [...expected.courses].sort();
    const match         = JSON.stringify(actualCodes) === JSON.stringify(expectedCodes);
    const termLabel     = termCodeToLabel(actual.term_code);

    if (match) {
        console.log(`  PASS  Semester ${i + 1} (${termLabel}): ${actualCodes.join(', ')}`);
    } else {
        console.log(`  FAIL  Semester ${i + 1} (${termLabel})`);
        console.log(`        Expected: ${expectedCodes.join(', ')}`);
        console.log(`        Got:      ${actualCodes.join(', ')}`);
        allPass = false;
    }
}

console.log('');
console.log(LINE);
if (allPass) {
    console.log('  RESULT: ALL SEMESTERS MATCH — Algorithm output is correct.');
} else {
    console.log('  RESULT: MISMATCH FOUND — Review the differences above.');
}
console.log(LINE + '\n');

process.exit(allPass ? 0 : 1);
