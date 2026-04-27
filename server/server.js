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
const programModelsRouter = require('./routes/programModels');

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
app.use('/api/program-models', programModelsRouter);

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

        // Allow NULL course_code for Student Elective placeholder rows.
        `ALTER TABLE schedule_items ALTER COLUMN course_code DROP NOT NULL`,
        `ALTER TABLE schedule_items DROP CONSTRAINT IF EXISTS schedule_items_course_code_fkey`,

        // ── Phase 1: Program model foundations ─────────────────────────────────
        // Faculty-authored, priority-ordered slot list per degree program. No
        // application code reads these yet (Phase 6: IEPGeneratorService).
        `CREATE TABLE IF NOT EXISTS program_model (
            id                      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            program_id              VARCHAR(50) NOT NULL REFERENCES degree_programs(degree_code) ON DELETE CASCADE,
            version                 INTEGER NOT NULL DEFAULT 1,
            effective_term          VARCHAR(10),
            created_by              UUID REFERENCES users(user_id),
            is_active               BOOLEAN NOT NULL DEFAULT FALSE,
            total_credits_required  INTEGER,
            created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            deleted_at              TIMESTAMP
        )`,
        // Belt-and-suspenders: ADD COLUMN for live containers created before
        // total_credits_required existed; backfill from legacy degree_models.
        `ALTER TABLE program_model ADD COLUMN IF NOT EXISTS total_credits_required INTEGER`,
        `UPDATE program_model pm
            SET total_credits_required = dm.total_credits_required
            FROM degree_models dm
            WHERE pm.program_id = dm.degree_code
              AND pm.total_credits_required IS NULL`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_program_model_active
            ON program_model (program_id) WHERE is_active = TRUE`,

        `CREATE TABLE IF NOT EXISTS program_model_row (
            id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            program_model_id    UUID NOT NULL REFERENCES program_model(id) ON DELETE CASCADE,
            priority            INTEGER NOT NULL,
            course_id           VARCHAR(20) REFERENCES courses(course_code),
            category            VARCHAR(50),
            level               INTEGER NOT NULL DEFAULT 1,
            is_elective         BOOLEAN NOT NULL DEFAULT FALSE,
            default_course_id   VARCHAR(20) REFERENCES courses(course_code),
            allowed_course_ids  VARCHAR(20)[],
            term_length         VARCHAR(20) DEFAULT 'FULL_16_WEEK',
            offered_in_summer   BOOLEAN NOT NULL DEFAULT TRUE,
            CONSTRAINT uq_program_model_row_priority UNIQUE (program_model_id, priority)
        )`,

        `CREATE TABLE IF NOT EXISTS iep_note (
            id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            schedule_id     UUID NOT NULL REFERENCES generated_schedules(schedule_id) ON DELETE CASCADE,
            semester_number INTEGER NOT NULL,
            code            VARCHAR(60) NOT NULL,
            severity        VARCHAR(10) NOT NULL,
            message         TEXT NOT NULL,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        // Separate fall/spring vs. summer targets; pinned program model; student type
        `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS takes_summer               BOOLEAN DEFAULT FALSE`,
        `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS target_courses_fall_spring INTEGER DEFAULT 3`,
        `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS target_credits_fall_spring INTEGER DEFAULT 12`,
        `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS target_courses_summer      INTEGER DEFAULT 2`,
        `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS target_credits_summer      INTEGER DEFAULT 6`,
        `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS selected_program_model_id  UUID REFERENCES program_model(id)`,
        `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS student_type               VARCHAR(10) DEFAULT 'new'`,

        // Lab pairing detection + 8-week term support
        `ALTER TABLE courses ADD COLUMN IF NOT EXISTS has_embedded_lab BOOLEAN DEFAULT FALSE`,
        `ALTER TABLE courses ADD COLUMN IF NOT EXISTS lab_course_id    VARCHAR(20) REFERENCES courses(course_code)`,
        `ALTER TABLE courses ADD COLUMN IF NOT EXISTS term_length      VARCHAR(20) DEFAULT 'FULL_16_WEEK'`,

        // Indexes for new FK / lookup paths
        `CREATE INDEX IF NOT EXISTS idx_program_model_program     ON program_model(program_id)`,
        `CREATE INDEX IF NOT EXISTS idx_program_model_row_model   ON program_model_row(program_model_id)`,
        `CREATE INDEX IF NOT EXISTS idx_program_model_row_course  ON program_model_row(course_id)`,
        `CREATE INDEX IF NOT EXISTS idx_iep_note_schedule         ON iep_note(schedule_id)`,
        `CREATE INDEX IF NOT EXISTS idx_student_profiles_program_model
            ON student_profiles(selected_program_model_id)`,

        // Value constraints in lieu of full PostgreSQL ENUM types — see
        // schema_updates.sql section 8 for rationale. ResolutionSource is
        // deferred to Phase 8 (its column does not exist yet).
        `DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_courses_term_length') THEN
                ALTER TABLE courses
                    ADD CONSTRAINT chk_courses_term_length
                    CHECK (term_length IN ('FULL_16_WEEK', 'FIRST_8_WEEK', 'SECOND_8_WEEK'));
            END IF;
        END $$`,
        `DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_program_model_row_term_length') THEN
                ALTER TABLE program_model_row
                    ADD CONSTRAINT chk_program_model_row_term_length
                    CHECK (term_length IN ('FULL_16_WEEK', 'FIRST_8_WEEK', 'SECOND_8_WEEK'));
            END IF;
        END $$`,
        `DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_student_profiles_student_type') THEN
                ALTER TABLE student_profiles
                    ADD CONSTRAINT chk_student_profiles_student_type
                    CHECK (student_type IN ('new', 'transfer', 'returning'));
            END IF;
        END $$`,
        `DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_iep_note_severity') THEN
                ALTER TABLE iep_note
                    ADD CONSTRAINT chk_iep_note_severity
                    CHECK (severity IN ('info', 'warning'));
            END IF;
        END $$`,

        // ── Phase 8 — elective resolution tracking ─────────────────────────────
        `ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS is_elective       BOOLEAN DEFAULT FALSE`,
        `ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS resolution_source VARCHAR(30)`,
        `ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS source_row_id     UUID REFERENCES program_model_row(id) ON DELETE SET NULL`,
        `CREATE INDEX IF NOT EXISTS idx_schedule_items_source_row ON schedule_items(source_row_id)`,
        // Phase 9 expands the set to include 'advisor_resolved'. Drop+recreate
        // so re-running this migration on a container that already has the old
        // CHECK doesn't get stuck with the narrower set.
        `DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_schedule_items_resolution_source') THEN
                ALTER TABLE schedule_items DROP CONSTRAINT chk_schedule_items_resolution_source;
            END IF;
            ALTER TABLE schedule_items
                ADD CONSTRAINT chk_schedule_items_resolution_source
                CHECK (resolution_source IS NULL
                       OR resolution_source IN ('required', 'elective_default', 'elective_chosen',
                                                'unresolved', 'advisor_resolved'));
        END $$`,

        // Phase 9 — reason column for unresolved slots.
        `ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS reason TEXT`,
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
