-- ==============================================================================
-- 1. EXTENSIONS & PREREQUISITE TABLES (To satisfy Foreign Keys)
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Mocking the courses table so the references work
CREATE TABLE IF NOT EXISTS courses (
    course_code VARCHAR(20) PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    credits INTEGER NOT NULL
);

-- Mocking the program_model table
CREATE TABLE IF NOT EXISTS program_model (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

-- ==============================================================================
-- 2. CREATE THE PROGRAM_MODEL_ROW TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS program_model_row (
    id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    program_model_id    UUID NOT NULL REFERENCES program_model(id) ON DELETE CASCADE,
    priority            INTEGER NOT NULL,
    course_id           VARCHAR(20) REFERENCES courses(course_code),  -- NULL for category placeholder
    category            VARCHAR(50),  -- e.g. 'MAJOR', 'GEN_ED_MATH', 'PROGRAM_ELECTIVE'
    level               INTEGER NOT NULL DEFAULT 1,
    is_elective         BOOLEAN NOT NULL DEFAULT FALSE,
    default_course_id   VARCHAR(20) REFERENCES courses(course_code),  -- required when is_elective = TRUE
    allowed_course_ids  VARCHAR(20)[],  -- list of eligible course codes for elective
    term_length         VARCHAR(20) DEFAULT 'FULL_16_WEEK',  -- 'FULL_16_WEEK' | 'FIRST_8_WEEK' | 'SECOND_8_WEEK'
    offered_in_summer   BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (program_model_id, priority)
);

-- ==============================================================================
-- 3. INSERT MOCK COURSES (So we don't hit Foreign Key violations during our insert)
-- ==============================================================================
INSERT INTO courses (course_code, title, credits) VALUES 
('ENC 1101', 'English Composition 1', 3), ('MAC 1105', 'College Algebra', 3),
('SLS 1106', 'First Year Experience', 1), ('CAI 2100C', 'Intro to AI', 3),
('COP 1047C', 'Intro to Python', 4), ('MAC 1147', 'Pre-Calculus', 5),
('ENC 1102', 'English Composition 2', 3), ('COP 1334', 'Intro to C++', 4),
('STA 2023', 'Statistical Methods', 3), ('CAI 2300C', 'Machine Learning Foundations', 3),
('COP 2800', 'Java Programming', 4), ('MAC 2311', 'Calculus 1', 5),
('PHY 1025', 'Basic Physics', 3), ('CAI 3821C', 'Comp Methods for AI 1', 3),
('CAI 2840C', 'Intro to Computer Vision', 3), ('MAC 2312', 'Calculus 2', 4),
('CAI 3822C', 'Comp Methods for AI 2', 3), ('COP 3530', 'Data Structures', 4),
('CAI 3303C', 'Natural Language Processing', 3), ('PHY 2048', 'Physics with Calculus', 4),
('PHY 2048L', 'Physics with Calculus Lab', 1), ('PHI 2680', 'AI and Ethics', 3),
('CHM 1045', 'General Chemistry', 3), ('CHM 1045L', 'General Chemistry Lab', 2),
('CAI 4505C', 'Artificial Intelligence', 3), ('CAI 4510C', 'Machine Intelligence', 3),
('CAI 4830C', 'Simulation for Applied AI', 3), ('CAI 4420C', 'Optimization Theory', 3),
('CAI 4525C', 'AI Systems Automation', 3), ('CAP 3330', 'Programming R for Stats', 4),
('STA 3164', 'Statistical Methods II', 4), ('AMH 2010', 'History of US to 1877', 3),
('POS 2041', 'American Federal Government', 3), ('ARH 1000', 'Art Appreciation', 3),
('HUM 1020', 'Humanities', 3), ('CAI 4950C', 'AI Capstone', 3),
('SPC 1017', 'Intro to Communications', 3), ('ENC 2300', 'Advanced Comm', 3),
('ECO 2013', 'Macroeconomics', 3), ('PSY 2012', 'Intro to Psychology', 3),
('LIT 2000', 'Intro to Literature', 3), ('MUL 1010', 'Music Appreciation', 3),
('CAP 4770', 'Data Mining', 3), ('CEN 4010', 'Software Engineering', 3)
ON CONFLICT (course_code) DO NOTHING;

-- Insert the Program Model and capture its UUID into a variable-like CTE structure below
-- To keep it standard SQL, we will just declare a specific UUID for this script run:
INSERT INTO program_model (id, name) 
VALUES ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 'Computer Science AA to Applied AI BS')
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 4. INSERT THE CURRICULUM SEQUENCE INTO PROGRAM_MODEL_ROW
-- ==============================================================================

INSERT INTO program_model_row 
(program_model_id, priority, course_id, category, level, is_elective, default_course_id, allowed_course_ids, term_length, offered_in_summer)
VALUES
-- --- SEMESTER 1 (Fall) ---
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 10, 'ENC 1101', 'GEN_ED_COMM', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 20, 'MAC 1105', 'GEN_ED_MATH', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 30, 'SLS 1106', 'GEN_ED_ELECTIVE', 1, FALSE, NULL, NULL, 'FIRST_8_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 40, 'CAI 2100C', 'MAJOR', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 50, 'COP 1047C', 'MAJOR', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- SEMESTER 2 (Spring) ---
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 60, 'MAC 1147', 'MAJOR_PREP', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 70, 'ENC 1102', 'GEN_ED_COMM', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 80, 'COP 1334', 'MAJOR', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 90, 'STA 2023', 'MAJOR_PREP', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- SEMESTER 3 (Summer) ---
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 100, 'CAI 2300C', 'MAJOR', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 110, 'COP 2800', 'MAJOR', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- SEMESTER 4 (Fall) ---
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 120, 'MAC 2311', 'MAJOR_PREP', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 130, 'PHY 1025', 'GEN_ED_SCIENCE', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 140, 'CAI 3821C', 'MAJOR', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 150, 'CAI 2840C', 'MAJOR', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- SEMESTER 5 (Spring) ---
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 160, 'MAC 2312', 'MAJOR_PREP', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 170, 'CAI 3822C', 'MAJOR', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 180, 'COP 3530', 'MAJOR', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 190, 'CAI 3303C', 'MAJOR', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- SEMESTER 6 (Summer) ---
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 200, 'PHY 2048', 'GEN_ED_SCIENCE', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 210, 'PHY 2048L', 'GEN_ED_SCIENCE_LAB', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 220, 'PHI 2680', 'GEN_ED_HUMANITIES', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- SEMESTER 7 (Fall) ---
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 230, 'CHM 1045', 'GEN_ED_SCIENCE', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 240, 'CHM 1045L', 'GEN_ED_SCIENCE_LAB', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 250, 'CAI 4505C', 'MAJOR', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', FALSE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 260, 'CAI 4510C', 'MAJOR', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', FALSE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 270, 'CAI 4830C', 'MAJOR', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', FALSE),

-- --- SEMESTER 8 (Spring) ---
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 280, 'CAI 4420C', 'MAJOR', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', FALSE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 290, 'CAI 4525C', 'MAJOR', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', FALSE),
-- Elective row for Stats
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 300, NULL, 'PROGRAM_ELECTIVE', 2, TRUE, 'CAP 3330', ARRAY['CAP 3330', 'STA 3164'], 'FULL_16_WEEK', TRUE),
-- Elective row for Gen Ed Social Science Core
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 310, NULL, 'GEN_ED_SOCIAL_SCIENCE', 1, TRUE, 'AMH 2010', ARRAY['AMH 2010', 'POS 2041'], 'FULL_16_WEEK', TRUE),
-- Elective row for Gen Ed Humanities Core
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 320, NULL, 'GEN_ED_HUMANITIES', 1, TRUE, 'ARH 1000', ARRAY['ARH 1000', 'HUM 1020'], 'FULL_16_WEEK', TRUE),

-- --- SEMESTER 9 (Fall) ---
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 330, 'CAI 4950C', 'CAPSTONE', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', FALSE),
-- Elective row for Oral Communication
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 340, NULL, 'GEN_ED_ORAL_COMM', 1, TRUE, 'SPC 1017', ARRAY['SPC 1017', 'ENC 2300'], 'FULL_16_WEEK', TRUE),
-- Elective row for Gen Ed Social Science MDC
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 350, NULL, 'GEN_ED_SOCIAL_SCIENCE', 1, TRUE, 'ECO 2013', ARRAY['ECO 2013', 'PSY 2012'], 'FULL_16_WEEK', TRUE),
-- Elective row for Gen Ed Humanities MDC
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 360, NULL, 'GEN_ED_HUMANITIES', 1, TRUE, 'LIT 2000', ARRAY['LIT 2000', 'MUL 1010'], 'FULL_16_WEEK', TRUE),
-- Elective rows for Program AI Electives
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 370, NULL, 'PROGRAM_ELECTIVE', 2, TRUE, 'CAP 4770', ARRAY['CAP 4770', 'CEN 4010'], 'FULL_16_WEEK', TRUE),
('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 380, NULL, 'PROGRAM_ELECTIVE', 2, TRUE, 'CEN 4010', ARRAY['CEN 4010', 'CAP 4770'], 'FULL_16_WEEK', TRUE)
ON CONFLICT (program_model_id, priority) DO NOTHING;