// =============================================================================
// db.js
// Database connection and schema setup using node:sqlite (built into Node.js).
//
// No installation needed — node:sqlite is included with Node.js v22 and later.
//
// Every other file in the project imports this module to get the db connection:
//   const db = require('./db');
// =============================================================================

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// The database file will be created in the same folder as this file (server/).
const db = new DatabaseSync(path.join(__dirname, 'expert-advisor.db'));

// WAL mode makes reads and writes faster and avoids file-lock conflicts.
db.exec('PRAGMA journal_mode = WAL');

// Foreign key enforcement is off by default in SQLite — turn it on.
db.exec('PRAGMA foreign_keys = ON');

// -----------------------------------------------------------------------------
// Create all tables (only runs if the table does not already exist).
// -----------------------------------------------------------------------------
db.exec(`

    -- Degree programs (e.g., "Computer Artificial Intelligence")
    CREATE TABLE IF NOT EXISTS majors (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT    NOT NULL
    );

    -- User accounts for login
    CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        email         TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        role          TEXT    NOT NULL DEFAULT 'student' -- 'student', 'advisor', 'faculty'
    );

    -- All courses in the catalog
    CREATE TABLE IF NOT EXISTS courses (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT    NOT NULL UNIQUE,   -- e.g., "CAI1001C"
        name TEXT    NOT NULL           -- e.g., "Intro to Artificial Intelligence"
    );

    -- A degree program's set of required courses (one model per major per year)
    CREATE TABLE IF NOT EXISTS program_models (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        major_id       INTEGER NOT NULL,
        effective_date TEXT    NOT NULL,    -- ISO date, e.g. "2024-01-01"
        FOREIGN KEY (major_id) REFERENCES majors(id)
    );

    -- Each course inside a program model, with its priority and allowed levels
    CREATE TABLE IF NOT EXISTS model_courses (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id       INTEGER NOT NULL,
        course_id      INTEGER NOT NULL,
        priority_index INTEGER NOT NULL,   -- 1 = first to be taken
        levels         TEXT    NOT NULL,   -- semicolon-delimited, e.g. "1;2;3"
        FOREIGN KEY (model_id)  REFERENCES program_models(id),
        FOREIGN KEY (course_id) REFERENCES courses(id)
    );

    -- Courses that can substitute for other courses in the model
    CREATE TABLE IF NOT EXISTS substitutions (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        original_course_id   INTEGER NOT NULL,
        substitute_course_id INTEGER NOT NULL,
        FOREIGN KEY (original_course_id)   REFERENCES courses(id),
        FOREIGN KEY (substitute_course_id) REFERENCES courses(id)
    );

    -- Student records
    CREATE TABLE IF NOT EXISTS students (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id              INTEGER,           -- Link to user account
        first_name           TEXT    NOT NULL,
        last_name            TEXT    NOT NULL,
        major_id             INTEGER NOT NULL,
        starting_term        TEXT,              -- Optional if new
        courses_per_semester INTEGER NOT NULL DEFAULT 3,
        delivery_mode        TEXT,              -- "Online", "Live", "Blended", "On-campus"
        preferred_days       TEXT,              -- JSON array
        preferred_times      TEXT,              -- JSON array
        skipped_terms        TEXT,              -- JSON array
        career_goal          TEXT,
        transfer_goals       TEXT,
        FOREIGN KEY (major_id) REFERENCES majors(id),
        FOREIGN KEY (user_id)  REFERENCES users(id)
    );

    -- Courses a student has already completed (their transcript)
    CREATE TABLE IF NOT EXISTS completed_courses (
        id                     INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id             INTEGER NOT NULL,
        course_id              INTEGER NOT NULL,
        grade                  TEXT,               -- e.g. "A", "B", "W", null
        substituting_course_id INTEGER,            -- null unless this was a substitution
        FOREIGN KEY (student_id)             REFERENCES students(id),
        FOREIGN KEY (course_id)              REFERENCES courses(id),
        FOREIGN KEY (substituting_course_id) REFERENCES courses(id)
    );

    -- Generated schedule output (one row per course per student per plan)
    CREATE TABLE IF NOT EXISTS plans (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id      INTEGER NOT NULL,
        course_id       INTEGER NOT NULL,
        semester_number INTEGER NOT NULL,   -- sequential: 1, 2, 3 ...
        term_code       TEXT    NOT NULL,   -- YYT format, e.g. "241"
        generated_at    TEXT    NOT NULL,   -- ISO timestamp
        FOREIGN KEY (student_id) REFERENCES students(id),
        FOREIGN KEY (course_id)  REFERENCES courses(id)
    );

`);

module.exports = db;
