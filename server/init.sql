-- =============================================================================
-- init.sql — IEP Engine database bootstrap
-- Run this on a blank database BEFORE starting the server or seeding.
--
--   docker exec -i iep_engine_db psql -U admin -d iep_engine < server/init.sql
--
-- Tables are ordered by dependency so every FK reference resolves at creation.
-- Safe to re-run: all statements use IF NOT EXISTS / DO blocks.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── ENUM TYPES ───────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE user_role_type AS ENUM (
    'Student', 'Advisor', 'Admin', 'Faculty'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE student_status_type AS ENUM (
    'Active', 'Inactive', 'Graduated', 'OnLeave'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE schedule_status_type AS ENUM (
    'Temporary', 'Official', 'Archived', 'Submitted',
    'Pending_Advisor_Review', 'Pending_Student_Acceptance'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE substitution_status_type AS ENUM (
    'Pending', 'Approved', 'Rejected', 'Under Review'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── TABLES (dependency order) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    user_id       UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    role          user_role_type NOT NULL,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at    TIMESTAMP,
    phone_number  VARCHAR(20),
    address       TEXT
);

CREATE TABLE IF NOT EXISTS departments (
    dept_id        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    dept_name      VARCHAR(255) NOT NULL,
    chairperson_id UUID REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS degree_programs (
    degree_code    VARCHAR(50) PRIMARY KEY,
    program_name   VARCHAR(255) NOT NULL,
    department_name VARCHAR(255),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dept_id        UUID REFERENCES departments(dept_id)
);

CREATE TABLE IF NOT EXISTS courses (
    course_code       VARCHAR(20) PRIMARY KEY,
    title             VARCHAR(255) NOT NULL,
    credits           INTEGER NOT NULL,
    description       TEXT,
    deleted_at        TIMESTAMP,
    prerequisite_codes TEXT,
    corequisite_codes TEXT
);

CREATE TABLE IF NOT EXISTS degree_models (
    model_id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    total_credits_required INTEGER NOT NULL,
    is_published           BOOLEAN DEFAULT false,
    version_number         INTEGER DEFAULT 1,
    created_by             UUID REFERENCES users(user_id),
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at             TIMESTAMP,
    degree_code            VARCHAR(50) REFERENCES degree_programs(degree_code) ON DELETE CASCADE,
    effective_term         VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS degree_requirements (
    requirement_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    model_id       UUID NOT NULL REFERENCES degree_models(model_id) ON DELETE CASCADE,
    course_code    VARCHAR(20) NOT NULL REFERENCES courses(course_code),
    priority_value INTEGER NOT NULL,
    is_wildcard    BOOLEAN DEFAULT false,
    deleted_at     TIMESTAMP,
    CONSTRAINT uq_degree_req_model_course UNIQUE (model_id, course_code)
);

CREATE TABLE IF NOT EXISTS requirement_levels (
    requirement_id UUID NOT NULL REFERENCES degree_requirements(requirement_id) ON DELETE CASCADE,
    level_value    INTEGER NOT NULL,
    PRIMARY KEY (requirement_id, level_value)
);

CREATE TABLE IF NOT EXISTS advisor_profiles (
    user_id              UUID PRIMARY KEY REFERENCES users(user_id),
    dept_id              UUID NOT NULL REFERENCES departments(dept_id),
    max_student_load     INTEGER DEFAULT 50,
    is_accepting_students BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS advisor_program_assignments (
    advisor_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    degree_code     VARCHAR(50) NOT NULL REFERENCES degree_programs(degree_code) ON DELETE CASCADE,
    assigned_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (advisor_user_id, degree_code)
);

CREATE TABLE IF NOT EXISTS student_profiles (
    user_id                  UUID PRIMARY KEY REFERENCES users(user_id),
    student_id               VARCHAR(50) NOT NULL UNIQUE,
    status                   student_status_type DEFAULT 'Active',
    current_degree_model_id  UUID REFERENCES degree_models(model_id),
    courses_per_semester     INTEGER DEFAULT 3,
    preferred_modality       JSONB,
    opt_out_summer           BOOLEAN DEFAULT false,
    updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at               TIMESTAMP,
    degree_code              VARCHAR(50) REFERENCES degree_programs(degree_code),
    preferred_campus_location VARCHAR(100),
    preferred_time_slot      JSONB,
    academic_standing        VARCHAR(50),
    expected_graduation_date DATE,
    is_currently_enrolled    BOOLEAN DEFAULT false,
    target_credits           INTEGER DEFAULT 12,
    preferred_term_durations JSONB,
    assigned_advisor_id      UUID REFERENCES users(user_id),
    starting_term            VARCHAR(10) DEFAULT '242',
    is_transfer              BOOLEAN DEFAULT false,
    secondary_campus_location VARCHAR(100) DEFAULT NULL,
    gpa                      DECIMAL(3,2) DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS academic_history (
    history_id    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES users(user_id),
    course_code   VARCHAR(20) NOT NULL REFERENCES courses(course_code),
    term_taken    VARCHAR(20),
    grade         CHAR(2),
    credits_earned INTEGER,
    is_transfer   BOOLEAN DEFAULT false,
    deleted_at    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generated_schedules (
    schedule_id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_user_id          UUID REFERENCES users(user_id),
    status                   schedule_status_type DEFAULT 'Temporary',
    projected_graduation_term VARCHAR(20),
    version_number           INTEGER DEFAULT 1,
    created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at               TIMESTAMP,
    generated_by_user_id     UUID REFERENCES users(user_id)
);

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

CREATE TABLE IF NOT EXISTS schedule_items (
    item_id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    schedule_id      UUID NOT NULL REFERENCES generated_schedules(schedule_id) ON DELETE CASCADE,
    course_code      VARCHAR(20) NOT NULL REFERENCES courses(course_code),
    semester_term    VARCHAR(20),
    semester_year    INTEGER,
    assigned_modality VARCHAR(50),
    deleted_at       TIMESTAMP,
    section_id       UUID REFERENCES course_sections(section_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS iep_status_history (
    history_id      SERIAL PRIMARY KEY,
    schedule_id     UUID NOT NULL REFERENCES generated_schedules(schedule_id) ON DELETE CASCADE,
    student_user_id UUID REFERENCES users(user_id),
    status          VARCHAR(30) NOT NULL,
    changed_by      UUID REFERENCES users(user_id),
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS iep_snapshots (
    snapshot_id     SERIAL PRIMARY KEY,
    schedule_id     UUID NOT NULL REFERENCES generated_schedules(schedule_id) ON DELETE CASCADE,
    student_user_id UUID REFERENCES users(user_id),
    snapshot_data   JSONB NOT NULL,
    status          VARCHAR(30) NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_substitutions (
    substitution_id      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    model_id             UUID REFERENCES degree_models(model_id),
    required_course_code VARCHAR(20) REFERENCES courses(course_code),
    external_course_id   VARCHAR(50),
    institution_name     VARCHAR(255),
    deleted_at           TIMESTAMP,
    student_user_id      UUID REFERENCES users(user_id),
    substitution_status  substitution_status_type DEFAULT 'Pending',
    assigned_reviewer_id UUID REFERENCES users(user_id),
    reviewer_comments    TEXT,
    submitted_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    review_date          TIMESTAMP,
    original_course_code VARCHAR(20),
    reason               TEXT
);

CREATE SEQUENCE IF NOT EXISTS permissions_permission_id_seq
    START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;

CREATE TABLE IF NOT EXISTS permissions (
    permission_id   INTEGER DEFAULT nextval('permissions_permission_id_seq') PRIMARY KEY,
    permission_name VARCHAR(50) NOT NULL UNIQUE,
    description     TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role          user_role_type NOT NULL,
    permission_id INTEGER NOT NULL REFERENCES permissions(permission_id),
    PRIMARY KEY (role, permission_id)
);

CREATE TABLE IF NOT EXISTS user_sessions (
    session_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id    UUID REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id         UUID REFERENCES users(user_id),
    action_type     VARCHAR(50) NOT NULL,
    target_table    VARCHAR(50),
    target_record_id UUID,
    old_value       JSONB,
    new_value       JSONB,
    ip_address      INET,
    event_time      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── INDEXES ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_academic_history_user         ON academic_history(user_id);
CREATE INDEX IF NOT EXISTS idx_academic_history_course       ON academic_history(course_code);
CREATE INDEX IF NOT EXISTS idx_degree_requirements_model     ON degree_requirements(model_id);
CREATE INDEX IF NOT EXISTS idx_schedule_items_schedule       ON schedule_items(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_items_course         ON schedule_items(course_code);
CREATE INDEX IF NOT EXISTS idx_student_profiles_degree       ON student_profiles(degree_code);
CREATE INDEX IF NOT EXISTS idx_student_profiles_model        ON student_profiles(current_degree_model_id);
CREATE INDEX IF NOT EXISTS idx_generated_schedules_student   ON generated_schedules(student_user_id);
CREATE INDEX IF NOT EXISTS idx_course_substitutions_student  ON course_substitutions(student_user_id);
CREATE INDEX IF NOT EXISTS idx_course_substitutions_reviewer ON course_substitutions(assigned_reviewer_id);
CREATE INDEX IF NOT EXISTS idx_advisor_program_assignments   ON advisor_program_assignments(advisor_user_id);

-- ── VIEWS ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_substitution_queue AS
SELECT cs.substitution_id, cs.substitution_status,
       s_user.first_name AS student_first_name, s_user.last_name AS student_last_name,
       cs.required_course_code, cs.external_course_id, cs.institution_name, cs.submitted_at,
       a_user.first_name AS reviewer_first_name, a_user.last_name AS reviewer_last_name
FROM course_substitutions cs
LEFT JOIN users s_user ON cs.student_user_id = s_user.user_id
LEFT JOIN users a_user ON cs.assigned_reviewer_id = a_user.user_id;
