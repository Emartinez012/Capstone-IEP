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
const facultyRouter  = require('./routes/faculty');

const app  = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/auth',     authRouter);
app.use('/api/students', studentsRouter);
app.use('/api/plans',    plansRouter);
app.use('/api/courses',  coursesRouter);
app.use('/api/majors',   majorsRouter);
app.use('/api/faculty',  facultyRouter);

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
        `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS courses_per_semester INTEGER`,

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

        // ── Faculty dashboard support ──────────────────────────────────────────
        // Add Faculty role to enum (IF NOT EXISTS prevents error if already added)
        `ALTER TYPE user_role_type ADD VALUE IF NOT EXISTS 'Faculty'`,

        // Substitution queue — add free-text reason column if not present
        // (original_course_code = required_course_code already exists in schema)
        `ALTER TABLE course_substitutions ADD COLUMN IF NOT EXISTS original_course_code VARCHAR(20)`,
        `ALTER TABLE course_substitutions ADD COLUMN IF NOT EXISTS reason TEXT`,

        // Index for multi-program advisor lookups
        `CREATE INDEX IF NOT EXISTS idx_advisor_program_assignments ON advisor_program_assignments(advisor_user_id)`,

        // Secondary campus preference
        `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS secondary_campus_location VARCHAR(100) DEFAULT NULL`,

        // GPA field
        `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS gpa DECIMAL(3,2) DEFAULT NULL`,

        // IEP status history — drop and recreate if missing required columns (safe: no real data)
        `DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'iep_status_history' AND column_name = 'status'
            ) THEN
                DROP TABLE IF EXISTS iep_status_history CASCADE;
                CREATE TABLE iep_status_history (
                    history_id      SERIAL PRIMARY KEY,
                    schedule_id     UUID NOT NULL REFERENCES generated_schedules(schedule_id) ON DELETE CASCADE,
                    student_user_id UUID REFERENCES users(user_id),
                    status          VARCHAR(30) NOT NULL,
                    changed_by      UUID REFERENCES users(user_id),
                    notes           TEXT,
                    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            END IF;
        END $$`,

        // IEP snapshots — drop and recreate if missing status column
        `DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'iep_snapshots' AND column_name = 'status'
            ) THEN
                DROP TABLE IF EXISTS iep_snapshots CASCADE;
                CREATE TABLE iep_snapshots (
                    snapshot_id     SERIAL PRIMARY KEY,
                    schedule_id     UUID NOT NULL REFERENCES generated_schedules(schedule_id) ON DELETE CASCADE,
                    student_user_id UUID REFERENCES users(user_id),
                    snapshot_data   JSONB NOT NULL,
                    status          VARCHAR(30) NOT NULL,
                    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            END IF;
        END $$`,
        // Belt-and-suspenders: add any still-missing columns on iep_snapshots
        `ALTER TABLE iep_snapshots ADD COLUMN IF NOT EXISTS status VARCHAR(30)`,
        `ALTER TABLE iep_snapshots ADD COLUMN IF NOT EXISTS student_user_id UUID`,

        // Description and corequisite columns on courses
        `ALTER TABLE courses ADD COLUMN IF NOT EXISTS description TEXT`,
        `ALTER TABLE courses ADD COLUMN IF NOT EXISTS corequisite_codes TEXT`,

        // Course sections table
        `CREATE TABLE IF NOT EXISTS course_sections (
            section_id     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            course_code    VARCHAR(20) NOT NULL REFERENCES courses(course_code) ON DELETE CASCADE,
            section_number VARCHAR(10) NOT NULL,
            instructor     VARCHAR(150),
            campus         VARCHAR(100),
            modality       VARCHAR(50),
            days           VARCHAR(20),
            start_time     VARCHAR(10),
            end_time       VARCHAR(10),
            term_code      VARCHAR(10),
            capacity       INTEGER DEFAULT 30,
            enrolled       INTEGER DEFAULT 0,
            created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            deleted_at     TIMESTAMP DEFAULT NULL
        )`,

        // Unique constraint on degree_requirements to allow ON CONFLICT upserts
        `DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_degree_req_model_course'
            ) THEN
                ALTER TABLE degree_requirements
                ADD CONSTRAINT uq_degree_req_model_course UNIQUE (model_id, course_code);
            END IF;
        END $$`,
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
