-- =============================================================================
-- schema_updates.sql
-- Run this against the iep_engine PostgreSQL container to apply all structural
-- improvements identified in the schema audit (April 2026).
--
-- Safe to run multiple times — all statements use IF NOT EXISTS / IF EXISTS.
-- Run with:
--   docker exec -i <container_name> psql -U admin -d iep_engine < schema_updates.sql
-- =============================================================================

-- ── 1. ENUM TYPE DEFINITIONS ──────────────────────────────────────────────────
-- These types are assumed to already exist in the live container.
-- Included here so a fresh restore from this file works without errors.
-- PostgreSQL has no "CREATE TYPE IF NOT EXISTS", so we use DO blocks.

DO $$ BEGIN
    CREATE TYPE schedule_status_type AS ENUM (
        'Temporary', 'Official', 'Archived', 'Submitted'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE user_role_type AS ENUM (
        'Student', 'Advisor', 'Admin', 'Faculty'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE student_status_type AS ENUM (
        'Active', 'Inactive', 'Graduated', 'OnLeave'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE substitution_status_type AS ENUM (
        'Pending', 'Approved', 'Rejected', 'Under Review'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 2. MISSING COLUMNS ON student_profiles ────────────────────────────────────
-- These two columns are required by the onboarding PUT route and plan algorithm
-- but were absent from the original CREATE TABLE definition.

ALTER TABLE student_profiles
    ADD COLUMN IF NOT EXISTS starting_term VARCHAR(10) DEFAULT '242';

ALTER TABLE student_profiles
    ADD COLUMN IF NOT EXISTS is_transfer BOOLEAN DEFAULT FALSE;


-- ── 3. NOT NULL CONSTRAINTS ON CRITICAL FK COLUMNS ───────────────────────────
-- These FK columns were defined nullable but should never be null in practice.
-- NOTE: Only safe to run after confirming no existing NULL rows. If you have
-- null rows (e.g., fresh seed), these will succeed. If not, fix nulls first.

ALTER TABLE academic_history
    ALTER COLUMN user_id    SET NOT NULL;

ALTER TABLE academic_history
    ALTER COLUMN course_code SET NOT NULL;

ALTER TABLE degree_requirements
    ALTER COLUMN model_id   SET NOT NULL;

ALTER TABLE degree_requirements
    ALTER COLUMN course_code SET NOT NULL;

ALTER TABLE schedule_items
    ALTER COLUMN schedule_id SET NOT NULL;

ALTER TABLE schedule_items
    ALTER COLUMN course_code SET NOT NULL;


-- ── 4. PERFORMANCE INDEXES ────────────────────────────────────────────────────
-- Foreign key columns with no index cause sequential scans. These cover all
-- high-frequency query paths used by the app.

-- academic_history — fetched on every plan generation
CREATE INDEX IF NOT EXISTS idx_academic_history_user
    ON public.academic_history USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_academic_history_course
    ON public.academic_history USING btree (course_code);

-- degree_requirements — core plan algorithm query
CREATE INDEX IF NOT EXISTS idx_degree_requirements_model
    ON public.degree_requirements USING btree (model_id);

-- schedule_items — fetched and cascade-deleted on every plan regeneration
CREATE INDEX IF NOT EXISTS idx_schedule_items_schedule
    ON public.schedule_items USING btree (schedule_id);

CREATE INDEX IF NOT EXISTS idx_schedule_items_course
    ON public.schedule_items USING btree (course_code);

-- student_profiles — advisor and plan generation lookups
CREATE INDEX IF NOT EXISTS idx_student_profiles_degree_code
    ON public.student_profiles USING btree (degree_code);

CREATE INDEX IF NOT EXISTS idx_student_profiles_degree_model
    ON public.student_profiles USING btree (current_degree_model_id);

-- generated_schedules — student plan retrieval
CREATE INDEX IF NOT EXISTS idx_generated_schedules_student
    ON public.generated_schedules USING btree (student_user_id);

-- course_substitutions — substitution queue and reviewer lookups (future feature)
CREATE INDEX IF NOT EXISTS idx_course_substitutions_student
    ON public.course_substitutions USING btree (student_user_id);

CREATE INDEX IF NOT EXISTS idx_course_substitutions_reviewer
    ON public.course_substitutions USING btree (assigned_reviewer_id);


-- ── 5. INTENTIONALLY UNUSED COLUMNS (FUTURE FEATURES) ────────────────────────
-- The following columns exist in the schema but are not yet wired up to any
-- application logic. They are preserved for future feature development.
--
-- student_profiles:
--   academic_standing         VARCHAR(50)   — GPA / standing display (Advisor dashboard)
--   expected_graduation_date  DATE          — Advisor-set graduation target
--   is_currently_enrolled     BOOLEAN       — Enrollment status flag
--   assigned_advisor_id       UUID → users  — Student–advisor assignment
--
-- schedule_items:
--   assigned_modality         VARCHAR(50)   — Section-matching phase of algorithm
--   section_id                UUID → course_sections — Specific section assignment
--
-- academic_history:
--   term_taken                VARCHAR(20)   — Term the course was taken/transferred
--   credits_earned            INTEGER       — Actual credits awarded
--
-- audit_logs (entire table)  — Admin audit trail (future Admin role)
--
-- course_sections (entire table) — Section scheduling (future algorithm phase)
--   modality, duration_weeks, days_of_week, start_time, end_time, capacity
--
-- iep_status_history (entire table) — IEP workflow status tracking
-- iep_snapshots      (entire table) — Point-in-time plan snapshots
--
-- No changes needed to these — they are schema-ready and waiting.

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================


-- ── 6. FACULTY DASHBOARD & IEP WORKFLOW ──────────────────────────────────────
-- Changes made after the original schema audit (April 2026).
-- All changes below are already applied by server.js migrate() at startup.
-- Included here so a fresh restore from postgreSQL schema + this file is complete.

-- Add Faculty role to user_role_type enum
ALTER TYPE user_role_type ADD VALUE IF NOT EXISTS 'Faculty';

-- Add new IEP status values to schedule_status_type
-- (PostgreSQL has no DROP VALUE, so use IF NOT EXISTS workaround via DO block)
DO $$ BEGIN
    ALTER TYPE schedule_status_type ADD VALUE IF NOT EXISTS 'Pending_Advisor_Review';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER TYPE schedule_status_type ADD VALUE IF NOT EXISTS 'Pending_Student_Acceptance';
EXCEPTION WHEN others THEN NULL; END $$;

-- course_substitutions: free-text reason and original course tracking
ALTER TABLE course_substitutions ADD COLUMN IF NOT EXISTS original_course_code VARCHAR(20);
ALTER TABLE course_substitutions ADD COLUMN IF NOT EXISTS reason TEXT;

-- student_profiles: secondary campus and GPA
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS secondary_campus_location VARCHAR(100) DEFAULT NULL;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS gpa DECIMAL(3,2) DEFAULT NULL;

-- iep_status_history: drop legacy columns, add workflow columns
-- (DO block: drop+recreate only if 'status' column is missing — i.e., old schema)
DO $$ BEGIN
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
END $$;

-- iep_snapshots: add status and student_user_id columns
DO $$ BEGIN
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
END $$;
ALTER TABLE iep_snapshots ADD COLUMN IF NOT EXISTS status VARCHAR(30);
ALTER TABLE iep_snapshots ADD COLUMN IF NOT EXISTS student_user_id UUID;

-- course_sections: replace narrow original with full scheduling definition
-- (CREATE TABLE IF NOT EXISTS — only creates on a blank DB; existing containers keep their table)
CREATE TABLE IF NOT EXISTS course_sections (
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
);

-- degree_requirements: unique constraint for ON CONFLICT upserts
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_degree_req_model_course'
    ) THEN
        ALTER TABLE degree_requirements
        ADD CONSTRAINT uq_degree_req_model_course UNIQUE (model_id, course_code);
    END IF;
END $$;

-- Index for multi-program advisor lookups
CREATE INDEX IF NOT EXISTS idx_advisor_program_assignments
    ON public.advisor_program_assignments USING btree (advisor_user_id);

-- corequisite_codes column on courses (required by plan generation algorithm)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS corequisite_codes TEXT;

-- courses_per_semester on student_profiles (derived from target_credits; used by advisor dashboard)
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS courses_per_semester INTEGER;

-- ── 7. ELECTIVE PLACEHOLDER ROWS IN schedule_items ──────────────────────────
-- Allow NULL course_code so Student Elective sentinel rows can be persisted.
ALTER TABLE schedule_items ALTER COLUMN course_code DROP NOT NULL;
ALTER TABLE schedule_items DROP CONSTRAINT IF EXISTS schedule_items_course_code_fkey;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
