// =============================================================================
// server.js
// Expert Advisor backend — Express server entry point.
//
// Start with:  node server.js
// The server listens on http://localhost:3001
// All API routes are prefixed with /api
// =============================================================================

const express = require('express');
const cors    = require('cors');
const db      = require('./db');

const authRouter     = require('./routes/auth');
const studentsRouter = require('./routes/students');
const plansRouter    = require('./routes/plans');
const coursesRouter  = require('./routes/courses');
const majorsRouter   = require('./routes/majors');

const app  = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/auth',     authRouter);
app.use('/api/students', studentsRouter);
app.use('/api/plans',    plansRouter);
app.use('/api/courses',  coursesRouter);
app.use('/api/majors',   majorsRouter);

app.get('/', (req, res) => {
    res.json({ message: 'Expert Advisor API is running.' });
});

// Ensures all structural changes are applied at startup without wiping data.
// Mirrors server/migrations/schema_updates.sql — safe to run repeatedly.
async function migrate() {
    const migrations = [
        // Missing student_profiles columns
        `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS starting_term VARCHAR(10) DEFAULT '242'`,
        `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS is_transfer BOOLEAN DEFAULT FALSE`,

        // NOT NULL on critical FK columns
        `ALTER TABLE academic_history    ALTER COLUMN user_id     SET NOT NULL`,
        `ALTER TABLE academic_history    ALTER COLUMN course_code SET NOT NULL`,
        `ALTER TABLE degree_requirements ALTER COLUMN model_id    SET NOT NULL`,
        `ALTER TABLE degree_requirements ALTER COLUMN course_code SET NOT NULL`,
        `ALTER TABLE schedule_items      ALTER COLUMN schedule_id SET NOT NULL`,
        `ALTER TABLE schedule_items      ALTER COLUMN course_code SET NOT NULL`,

        // Performance indexes
        `CREATE INDEX IF NOT EXISTS idx_academic_history_user       ON academic_history(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_academic_history_course     ON academic_history(course_code)`,
        `CREATE INDEX IF NOT EXISTS idx_degree_requirements_model   ON degree_requirements(model_id)`,
        `CREATE INDEX IF NOT EXISTS idx_schedule_items_schedule     ON schedule_items(schedule_id)`,
        `CREATE INDEX IF NOT EXISTS idx_schedule_items_course       ON schedule_items(course_code)`,
        `CREATE INDEX IF NOT EXISTS idx_student_profiles_degree     ON student_profiles(degree_code)`,
        `CREATE INDEX IF NOT EXISTS idx_student_profiles_model      ON student_profiles(current_degree_model_id)`,
        `CREATE INDEX IF NOT EXISTS idx_generated_schedules_student ON generated_schedules(student_user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_course_substitutions_student ON course_substitutions(student_user_id)`,
    ];

    for (const sql of migrations) {
        try {
            await db.query(sql);
        } catch (err) {
            // Warn but don't crash — constraint may already be set
            console.warn('Migration warning:', err.message);
        }
    }
    console.log('Migrations applied.');
}

async function start() {
    await db.waitForDb();
    await migrate();
    app.listen(PORT, () => {
        console.log(`Expert Advisor server running on http://localhost:${PORT}`);
    });
}

start();
