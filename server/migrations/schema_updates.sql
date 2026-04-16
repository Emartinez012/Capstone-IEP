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
