// =============================================================================
// seed.js
// Populates the database with the CAI degree model, default users,
// and 500 synthetic students.
//
// Run with:  node seed.js
//
// Safe to run multiple times — it clears all existing data first.
// =============================================================================

const db = require('./db');
const caiModel = require('./data/cai_model.json');
const bcrypt = require('bcryptjs');

// -----------------------------------------------------------------------------
// Helper: pick a random item from an array
// -----------------------------------------------------------------------------
function randomFrom(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// -----------------------------------------------------------------------------
// Helper: pick a random integer between min and max (inclusive)
// -----------------------------------------------------------------------------
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// -----------------------------------------------------------------------------
// Helper: weighted random pick
// Returns one of the values array based on corresponding weights array.
// Example: weightedRandom([2,3,4], [25,60,15]) returns 3 most often.
// -----------------------------------------------------------------------------
function weightedRandom(values, weights) {
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < values.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return values[i];
    }
    return values[values.length - 1];
}

// -----------------------------------------------------------------------------
// Name pools for generating realistic-looking student names
// -----------------------------------------------------------------------------
const FIRST_NAMES = [
    'James', 'Maria', 'Robert', 'Linda', 'Michael', 'Barbara', 'William', 'Patricia',
    'David', 'Jennifer', 'Richard', 'Lisa', 'Joseph', 'Sandra', 'Thomas', 'Ashley',
    'Charles', 'Dorothy', 'Christopher', 'Kimberly', 'Daniel', 'Emily', 'Matthew',
    'Donna', 'Anthony', 'Michelle', 'Mark', 'Carol', 'Donald', 'Amanda', 'Steven',
    'Melissa', 'Paul', 'Deborah', 'Andrew', 'Stephanie', 'Joshua', 'Rebecca', 'Kenneth',
    'Sharon', 'Kevin', 'Laura', 'Brian', 'Cynthia', 'George', 'Kathleen', 'Timothy',
    'Amy', 'Ronald', 'Angela', 'Edward', 'Shirley', 'Jason', 'Anna', 'Jeffrey',
    'Brenda', 'Ryan', 'Pamela', 'Jacob', 'Emma', 'Gary', 'Nicole', 'Nicholas',
    'Helen', 'Eric', 'Samantha', 'Jonathan', 'Katherine', 'Stephen', 'Christine',
    'Larry', 'Debra', 'Justin', 'Rachel', 'Scott', 'Carolyn', 'Brandon', 'Janet',
    'Frank', 'Catherine', 'Benjamin', 'Maria', 'Gregory', 'Heather', 'Raymond',
    'Diane', 'Samuel', 'Julie', 'Patrick', 'Joyce', 'Alexander', 'Victoria', 'Jack',
    'Kelly', 'Dennis', 'Christina', 'Jerry', 'Lauren', 'Tyler', 'Joan'
];

const LAST_NAMES = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
    'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
    'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
    'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
    'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
    'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker',
    'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy',
    'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey',
    'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson',
    'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz',
    'Hughes', 'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long',
    'Ross', 'Foster', 'Jimenez', 'Powell'
];

// Valid starting terms (Fall 2023 through Fall 2026)
const STARTING_TERMS = ['231', '232', '233', '241', '242', '243', '251', '252', '253', '261'];

// Possible grades for completed courses
const PASSING_GRADES = ['A', 'A', 'A', 'B', 'B', 'C'];  // weighted toward A/B
const ALL_GRADES = [...PASSING_GRADES, ...PASSING_GRADES, ...PASSING_GRADES, 'D', 'W'];

// -----------------------------------------------------------------------------
// STEP 1 — Clear all existing data (in reverse foreign-key order)
// -----------------------------------------------------------------------------
console.log('Clearing existing data...');
db.exec(`
    DELETE FROM plans;
    DELETE FROM completed_courses;
    DELETE FROM students;
    DELETE FROM users;
    DELETE FROM substitutions;
    DELETE FROM model_courses;
    DELETE FROM program_models;
    DELETE FROM courses;
    DELETE FROM majors;
`);

// Reset auto-increment counters
db.exec(`
    DELETE FROM sqlite_sequence WHERE name IN (
        'plans','completed_courses','students','users','substitutions',
        'model_courses','program_models','courses','majors'
    );
`);

// -----------------------------------------------------------------------------
// STEP 2 — Insert Default Users
// -----------------------------------------------------------------------------
console.log('Inserting default user accounts...');
const hash = bcrypt.hashSync('password123', 10);
const insertUser = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)');
insertUser.run('student1@mdc.edu', hash, 'student');
insertUser.run('advisor1@mdc.edu', hash, 'advisor');
insertUser.run('faculty1@mdc.edu', hash, 'faculty');

// -----------------------------------------------------------------------------
// STEP 3 — Insert the CAI major
// -----------------------------------------------------------------------------
console.log('Inserting CAI major...');
const insertMajor = db.prepare('INSERT INTO majors (name) VALUES (?)');
const majorResult = insertMajor.run(caiModel.major.name);
const majorId = majorResult.lastInsertRowid;

// -----------------------------------------------------------------------------
// STEP 4 — Insert all 17 courses and store their IDs
// -----------------------------------------------------------------------------
console.log('Inserting courses...');
const insertCourse = db.prepare('INSERT INTO courses (code, name) VALUES (?, ?)');

// courseIdByCode lets us look up a course's database ID by its code string.
const courseIdByCode = {};

for (const course of caiModel.courses) {
    const result = insertCourse.run(course.code, course.name);
    courseIdByCode[course.code] = result.lastInsertRowid;
}

// -----------------------------------------------------------------------------
// STEP 5 — Insert the program model record
// -----------------------------------------------------------------------------
console.log('Inserting program model...');
const insertModel = db.prepare('INSERT INTO program_models (major_id, effective_date) VALUES (?, ?)');
const modelResult = insertModel.run(majorId, caiModel.effective_date);
const modelId = modelResult.lastInsertRowid;

// -----------------------------------------------------------------------------
// STEP 6 — Insert all 17 model_courses with priority and levels
// -----------------------------------------------------------------------------
console.log('Inserting model courses...');
const insertModelCourse = db.prepare(`
    INSERT INTO model_courses (model_id, course_id, priority_index, levels)
    VALUES (?, ?, ?, ?)
`);

for (const course of caiModel.courses) {
    const courseId = courseIdByCode[course.code];
    insertModelCourse.run(modelId, courseId, course.priority, course.levels);
}

// Build a sorted array of course IDs in priority order (used when assigning
// completed courses to students below).
const courseIdsByPriority = caiModel.courses
    .sort((a, b) => a.priority - b.priority)
    .map(c => courseIdByCode[c.code]);

// -----------------------------------------------------------------------------
// STEP 7 — Generate 500 synthetic students
// -----------------------------------------------------------------------------
console.log('Generating 500 students...');

const insertStudent = db.prepare(`
    INSERT INTO students (first_name, last_name, major_id, starting_term, courses_per_semester, delivery_mode)
    VALUES (?, ?, ?, ?, ?, 'On-campus')
`);

const insertCompleted = db.prepare(`
    INSERT INTO completed_courses (student_id, course_id, grade, substituting_course_id)
    VALUES (?, ?, ?, NULL)
`);

// Define the groups: [count, minCourses, maxCourses]
const GROUPS = [
    { count: 100, minCompleted: 0,  maxCompleted: 0  },  // brand new
    { count: 125, minCompleted: 1,  maxCompleted: 4  },  // early
    { count: 125, minCompleted: 5,  maxCompleted: 9  },  // mid
    { count: 100, minCompleted: 10, maxCompleted: 14 },  // late
    { count: 50,  minCompleted: 15, maxCompleted: 17 },  // near graduation
];

// Wrap all 500 inserts in a single transaction for speed.
db.exec('BEGIN');
try {
    for (const group of GROUPS) {
        for (let i = 0; i < group.count; i++) {
            // Pick random student properties
            const firstName   = randomFrom(FIRST_NAMES);
            const lastName    = randomFrom(LAST_NAMES);
            const startTerm   = randomFrom(STARTING_TERMS);
            const coursesPerSemester = weightedRandom([2, 3, 4], [20, 60, 20]);

            // Insert the student record
            const studentResult = insertStudent.run(
                firstName, lastName, majorId, startTerm, coursesPerSemester
            );
            const studentId = studentResult.lastInsertRowid;

            // Decide how many courses this student has completed
            const numCompleted = group.minCompleted === group.maxCompleted
                ? group.minCompleted
                : randomInt(group.minCompleted, group.maxCompleted);

            // Mark the first numCompleted courses (by priority) as completed
            for (let c = 0; c < numCompleted; c++) {
                const courseId = courseIdsByPriority[c];
                const grade    = randomFrom(ALL_GRADES);
                insertCompleted.run(studentId, courseId, grade);
            }
        }
    }
    db.exec('COMMIT');
} catch (err) {
    db.exec('ROLLBACK');
    throw err;
}

// -----------------------------------------------------------------------------
// STEP 8 — Print a summary
// -----------------------------------------------------------------------------
const studentCount  = db.prepare('SELECT COUNT(*) AS count FROM students').get().count;
const userCount     = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
const completedCount = db.prepare('SELECT COUNT(*) AS count FROM completed_courses').get().count;

console.log('');
console.log('✓  Seeding complete!');
console.log('');
console.log(`    Users inserted:             ${userCount}`);
console.log(`    Students inserted:          ${studentCount}`);
console.log(`    Completed course records:   ${completedCount}`);
console.log('');
