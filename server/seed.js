const db = require('./db');
const bcrypt = require('bcryptjs');

async function seed() {
    console.log('Starting PostgreSQL Seeding...');
    
    try {
        // 1. Clean old data (Order matters for Foreign Keys!)
        console.log('Clearing existing data...');
        await db.query('DELETE FROM schedule_items');
        await db.query('DELETE FROM generated_schedules');
        await db.query('DELETE FROM academic_history');
        await db.query('DELETE FROM student_profiles');
        await db.query('DELETE FROM advisor_profiles'); 
        await db.query('DELETE FROM users');
        await db.query('DELETE FROM courses');
        await db.query('DELETE FROM degree_programs');
        await db.query('DELETE FROM departments');

        // 2. Create a Department
        const deptRes = await db.query(`
            INSERT INTO departments (dept_name) 
            VALUES ('School of Engineering and Technology') 
            RETURNING dept_id
        `);
        const deptId = deptRes.rows[0].dept_id;

        // 3. Create Degree Programs (Fixed: removed required_credits)
        console.log('Seeding degree programs...');
        await db.query(`
            INSERT INTO degree_programs (degree_code, dept_id, program_name)
            VALUES 
            ('BS-SE', $1, 'Software Engineering'),
            ('BS-CAI', $1, 'Computer Artificial Intelligence')
        `, [deptId]);

        // 4. Create a Default Admin User (Fixed: added first_name and last_name)
        const adminHash = await bcrypt.hash('admin123', 10);
        await db.query(`
            INSERT INTO users (first_name, last_name, email, password_hash, role) 
            VALUES ('System', 'Admin', 'admin@mdc.edu', $1, 'Advisor')
        `, [adminHash]);

// 5. Create some sample courses (Fixed: removed priority_index)
        console.log('Seeding courses...');
        const courses = [
            ['COP1000', 'Intro to Programming', 3],
            ['COP2800', 'Java Programming', 3],
            ['MAC1105', 'College Algebra', 3],
            ['ENC1101', 'English Composition 1', 3]
        ];

        for (const [code, title, credits] of courses) {
            await db.query(`
                INSERT INTO courses (course_code, title, credits)
                VALUES ($1, $2, $3)
            `, [code, title, credits]);
        }

        console.log('Seeding complete! Degree programs and courses are now ready.');
    } catch (err) {
        console.error('Seeding Error:', err.message);
    } finally {
        process.exit();
    }
}

seed();