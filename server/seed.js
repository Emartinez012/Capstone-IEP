// =============================================================================
// server/seed.js
// Populates the database with degree programs, courses, and test users.
// Run with: node seed.js
// =============================================================================
const db     = require('./db');
const bcrypt = require('bcryptjs');

// All courses for both degree tracks (S9501 and S9520)
const coursesData = [
    // General Education / Math Core
    { code: 'ENC1101',  title: 'English Composition 1',                               credits: 3, prereq: null },
    { code: 'ENC1102',  title: 'English Composition 2',                               credits: 3, prereq: 'ENC1101' },
    { code: 'MAC1105',  title: 'College Algebra',                                      credits: 3, prereq: null },
    { code: 'MAC2311',  title: 'Calculus and Analytical Geometry 1',                   credits: 5, prereq: '(MAC1106 AND MAC1114) OR (MAC1140 AND MAC1114) OR MAC1147' },
    { code: 'STA2023',  title: 'Statistical Methods',                                  credits: 3, prereq: 'MAC1105' },

    // Software Engineering Core (S9501)
    { code: 'CGS1060C', title: 'Introduction to Computer Technology & Applications',   credits: 4, prereq: null },
    { code: 'CGS1540C', title: 'Database Concepts and Design',                         credits: 4, prereq: 'CGS1060C' },
    { code: 'COP1334',  title: 'Introduction to C++ Programming',                      credits: 4, prereq: 'CGS1060C' },
    { code: 'COP2800',  title: 'Java Programming',                                     credits: 4, prereq: 'COP1334 OR COP1047C' },
    { code: 'CTS1134',  title: 'Networking Technologies',                              credits: 4, prereq: null },
    { code: 'CGS3763',  title: 'Operating System Principles',                          credits: 4, prereq: 'COP1334' },
    { code: 'CIS3510',  title: 'IT Project Management',                                credits: 4, prereq: null },

    // Applied Artificial Intelligence Core (S9520)
    { code: 'CAI1001C', title: 'Artificial Intelligence (AI) Thinking',                credits: 3, prereq: null },
    { code: 'CAI2100C', title: 'Machine Learning Foundations',                         credits: 3, prereq: 'CAI1001C' },
    { code: 'CAI2300C', title: 'Introduction to Natural Language Processing',           credits: 3, prereq: 'CAI2100C AND COP1047C' },
    { code: 'COP1047C', title: 'Introduction to Python Programming',                   credits: 4, prereq: null },
    { code: 'CAI2840C', title: 'Introduction to Computer Vision',                      credits: 3, prereq: 'CAI2100C' },
    { code: 'PHI2680',  title: 'Artificial Intelligence and Ethics',                   credits: 3, prereq: null },
    { code: 'CAI3303C', title: 'Natural Language Processing',                          credits: 3, prereq: 'CAI2300C' },
    { code: 'CAI3821C', title: 'Computational Methods and Applications for AI 1',      credits: 3, prereq: 'CAI2100C AND COP1047C AND MAC1105 AND STA2023' },
    { code: 'CAI4505C', title: 'Artificial Intelligence',                              credits: 3, prereq: 'CAI3821C AND COP3530' },
    { code: 'COP3530',  title: 'Data Structures',                                      credits: 4, prereq: 'COP2800' },
];

// S9501 requirements with priority values (lower = scheduled earlier)
const seCourses = [
    ['ENC1101',  1],
    ['MAC1105',  2],
    ['CGS1060C', 3],
    ['CTS1134',  4],
    ['CIS3510',  5],
    ['CGS1540C', 6],
    ['COP1334',  7],
    ['CGS3763',  8],
    ['COP2800',  9],
];

// S9520 requirements with priority values
const aiCourses = [
    ['ENC1101',  1],
    ['MAC1105',  2],
    ['CAI1001C', 3],
    ['COP1047C', 4],
    ['PHI2680',  5],
    ['STA2023',  6],
    ['CAI2100C', 7],
    ['COP2800',  8],
    ['CAI2840C', 9],
    ['CAI2300C', 10],
    ['CAI3821C', 11],
    ['CAI3303C', 12],
    ['COP3530',  13],
    ['CAI4505C', 14],
];

async function seed() {
    console.log('Starting seed...');
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        // Add columns that exist in the app but may be missing from the live schema
        await client.query(`ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS starting_term VARCHAR(10) DEFAULT '242'`);
        await client.query(`ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS is_transfer BOOLEAN DEFAULT FALSE`);

        // Clear all data (cascade handles FK order)
        console.log('Clearing existing data...');
        await client.query(`
            TRUNCATE TABLE
                schedule_items, generated_schedules, academic_history,
                student_profiles, advisor_profiles, advisor_program_assignments,
                degree_requirements, requirement_levels, degree_models,
                degree_programs, departments, courses, users
            CASCADE
        `);

        // Insert courses
        console.log('Inserting courses...');
        for (const course of coursesData) {
            await client.query(
                `INSERT INTO courses (course_code, title, credits, prerequisite_codes)
                 VALUES ($1, $2, $3, $4)`,
                [course.code, course.title, course.credits, course.prereq]
            );
        }

        // Insert department
        const deptRes = await client.query(
            `INSERT INTO departments (dept_name) VALUES ($1) RETURNING dept_id`,
            ['Technology/Engineering']
        );
        const deptId = deptRes.rows[0].dept_id;

        // --- S9501: Software Engineering ---
        console.log('Setting up S9501 (Software Engineering)...');
        const seDegreeCode = 'S9501';
        await client.query(
            `INSERT INTO degree_programs (degree_code, program_name, department_name, dept_id)
             VALUES ($1, $2, $3, $4)`,
            [seDegreeCode, 'B.S. Information Systems Tech - Software Engineering Concentration', 'Technology/Engineering', deptId]
        );

        const seModelRes = await client.query(
            `INSERT INTO degree_models (total_credits_required, is_published, version_number, degree_code, effective_term)
             VALUES ($1, $2, $3, $4, $5) RETURNING model_id`,
            [120, true, 1, seDegreeCode, 'Fall 2024']
        );
        const seModelId = seModelRes.rows[0].model_id;

        for (const [code, priority] of seCourses) {
            await client.query(
                `INSERT INTO degree_requirements (model_id, course_code, priority_value)
                 VALUES ($1, $2, $3)`,
                [seModelId, code, priority]
            );
        }

        // --- S9520: Applied Artificial Intelligence ---
        console.log('Setting up S9520 (Applied Artificial Intelligence)...');
        const aiDegreeCode = 'S9520';
        await client.query(
            `INSERT INTO degree_programs (degree_code, program_name, department_name, dept_id)
             VALUES ($1, $2, $3, $4)`,
            [aiDegreeCode, 'B.S. Applied Artificial Intelligence', 'Technology/Engineering', deptId]
        );

        const aiModelRes = await client.query(
            `INSERT INTO degree_models (total_credits_required, is_published, version_number, degree_code, effective_term)
             VALUES ($1, $2, $3, $4, $5) RETURNING model_id`,
            [120, true, 1, aiDegreeCode, 'Fall 2025']
        );
        const aiModelId = aiModelRes.rows[0].model_id;

        for (const [code, priority] of aiCourses) {
            await client.query(
                `INSERT INTO degree_requirements (model_id, course_code, priority_value)
                 VALUES ($1, $2, $3)`,
                [aiModelId, code, priority]
            );
        }

        // --- Test Users ---
        console.log('Creating test users...');

        // Student: student1@mdc.edu / password123 — enrolled in S9501 (SE)
        const studentHash = await bcrypt.hash('password123', 10);
        const studentUserRes = await client.query(
            `INSERT INTO users (first_name, last_name, email, password_hash, role)
             VALUES ('Alex', 'Martinez', 'student1@mdc.edu', $1, 'Student')
             RETURNING user_id`,
            [studentHash]
        );
        await client.query(
            `INSERT INTO student_profiles
                (user_id, student_id, degree_code, current_degree_model_id, target_credits, starting_term, opt_out_summer)
             VALUES ($1, 'MDC-10001', $2, $3, 12, '252', false)`,
            [studentUserRes.rows[0].user_id, seDegreeCode, seModelId]
        );

        // Advisor: advisor1@mdc.edu / password123
        const advisorHash = await bcrypt.hash('password123', 10);
        const advisorUserRes = await client.query(
            `INSERT INTO users (first_name, last_name, email, password_hash, role)
             VALUES ('Dr', 'Advisor', 'advisor1@mdc.edu', $1, 'Advisor')
             RETURNING user_id`,
            [advisorHash]
        );
        await client.query(
            `INSERT INTO advisor_profiles (user_id, dept_id) VALUES ($1, $2)`,
            [advisorUserRes.rows[0].user_id, deptId]
        );

        await client.query('COMMIT');
        console.log('Seeding completed successfully!');
        console.log('  student1@mdc.edu / password123  (S9501 - Software Engineering)');
        console.log('  advisor1@mdc.edu / password123');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Seeding failed, rolled back:', err.message);
    } finally {
        client.release();
        process.exit();
    }
}

seed();
