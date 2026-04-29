-- ==============================================================================
-- 1. EXTENSIONS & PREREQUISITE TABLES (To satisfy Foreign Keys)
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS courses (
    course_code VARCHAR(20) PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    credits INTEGER NOT NULL
);

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
    course_id           VARCHAR(20) REFERENCES courses(course_code), 
    category            VARCHAR(50), 
    level               INTEGER NOT NULL DEFAULT 1,
    is_elective         BOOLEAN NOT NULL DEFAULT FALSE,
    default_course_id   VARCHAR(20) REFERENCES courses(course_code), 
    allowed_course_ids  VARCHAR(20)[], 
    term_length         VARCHAR(20) DEFAULT 'FULL_16_WEEK', 
    offered_in_summer   BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (program_model_id, priority)
);

-- ==============================================================================
-- 3. INSERT COURSES FOR BS-IST SOFTWARE ENGINEERING
-- ==============================================================================
INSERT INTO courses (course_code, title, credits) VALUES 
('ENC 1101', 'English Composition 1', 3), ('MAC 1105', 'College Algebra', 3),
('SLS 1106', 'First Year Experience', 1), ('CGS 1060C', 'Computer Competency', 4),
('MAC 1147', 'Pre-Calculus', 5), ('ENC 1102', 'English Composition 2', 3),
('COP 1334', 'Intro to C++', 4), ('CTS 1134', 'Networking Technologies', 4),
('SPC 1017', 'Intro to Communications', 3), ('MAC 2311', 'Calculus 1', 5),
('COP 2800', 'Java Programming', 4), ('CET 2123C', 'Microprocessors', 4),
('PHY 2048', 'Physics with Calculus 1', 4), ('PHY 2048L', 'Physics with Calculus 1 Lab', 1),
('STA 2023', 'Statistical Methods', 3), ('COT 3100', 'Discrete Structures', 4),
('ARH 1000', 'Art Appreciation', 3), ('COP 3530', 'Data Structures', 4),
('CIS 3360', 'Principles of Info Security', 4), ('CGS 3763', 'Operating Systems Principles', 4),
('PHY 2049', 'Physics with Calculus 2', 4), ('PHY 2049L', 'Physics with Calculus 2 Lab', 1),
('POS 2041', 'American Federal Government', 3), ('LIT 2000', 'Intro to Literature', 3),
('ECO 2013', 'Macroeconomics', 3), ('CEN 4065C', 'Software Architecture and Design', 4),
('ETI 4480C', 'Applied Robotics', 4), ('CEN 4090C', 'Software Engineering Capstone', 4),
('CEN 4010', 'Software Engineering', 4), ('CAP 4770', 'Data Mining', 4),
('CIS 4327', 'Information Systems Planning', 4), ('CEN 4341', 'Platform Based Development', 4),
('CAP 4773', 'Data Science', 4)
ON CONFLICT (course_code) DO NOTHING;

-- Insert the Program Model and capture its UUID (Static UUID used for script logic)
INSERT INTO program_model (id, name) 
VALUES ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 'Information Systems Tech - Software Engineering')
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 4. INSERT THE CURRICULUM SEQUENCE INTO PROGRAM_MODEL_ROW (120 Credits)
-- ==============================================================================

INSERT INTO program_model_row 
(program_model_id, priority, course_id, category, level, is_elective, default_course_id, allowed_course_ids, term_length, offered_in_summer)
VALUES
-- --- LEVEL 1: Foundations & Prerequisites (Priority 10-50) ---
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 10, 'ENC 1101', 'GEN_ED_COMM', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 20, 'MAC 1105', 'GEN_ED_MATH', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 30, 'SLS 1106', 'GEN_ED_ELECTIVE', 1, FALSE, NULL, NULL, 'FIRST_8_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 40, 'CGS 1060C', 'LOWER_DIV_TECH', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 50, 'CTS 1134', 'LOWER_DIV_TECH', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- LEVEL 2: Intro Programming & Intermediate Math (Priority 60-100) ---
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 60, 'ENC 1102', 'GEN_ED_COMM', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 70, 'MAC 1147', 'MAJOR_PREP', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 80, 'COP 1334', 'LOWER_DIV_TECH', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 90, 'SPC 1017', 'GEN_ED_ORAL_COMM', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 100, 'STA 2023', 'GEN_ED_MATH', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- LEVEL 3: Core CS Transitions (Priority 110-150) ---
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 110, 'MAC 2311', 'MAJOR_PREP', 3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 120, 'COP 2800', 'LOWER_DIV_TECH', 3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 130, 'CET 2123C', 'LOWER_DIV_TECH', 3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 140, 'CIS 3360', 'MAJOR', 3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 150, 'COT 3100', 'MAJOR', 3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- LEVEL 4: Data Structures & State Gen Eds (Priority 160-200) ---
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 160, 'COP 3530', 'MAJOR', 4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 170, 'CGS 3763', 'MAJOR', 4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 180, 'PHY 2048', 'GEN_ED_SCIENCE', 4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 190, 'PHY 2048L', 'GEN_ED_SCIENCE_LAB', 4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 200, 'ARH 1000', 'GEN_ED_HUMANITIES', 4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- LEVEL 5: Architecture, Robotics & MDC Gen Eds (Priority 210-250) ---
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 210, 'CEN 4065C', 'MAJOR', 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 220, 'ETI 4480C', 'MAJOR', 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 230, 'PHY 2049', 'GEN_ED_SCIENCE', 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 240, 'PHY 2049L', 'GEN_ED_SCIENCE_LAB', 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 250, 'POS 2041', 'GEN_ED_SOCIAL_SCIENCE', 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- LEVEL 6: Capstone & Program Electives (Priority 260-320) ---
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 260, 'LIT 2000', 'GEN_ED_HUMANITIES', 6, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 270, 'ECO 2013', 'GEN_ED_SOCIAL_SCIENCE', 6, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 280, 'CEN 4090C', 'CAPSTONE', 7, FALSE, NULL, NULL, 'FULL_16_WEEK', FALSE),

-- Group A Elective (Needs 8 Credits)
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 290, NULL, 'PROGRAM_ELECTIVE_A', 6, TRUE, 'CEN 4010', ARRAY['CEN 4010', 'CAP 4770'], 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 300, NULL, 'PROGRAM_ELECTIVE_A', 6, TRUE, 'CAP 4770', ARRAY['CEN 4010', 'CAP 4770'], 'FULL_16_WEEK', TRUE),

-- Group B Electives (Needs 12 Credits)
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 310, NULL, 'PROGRAM_ELECTIVE_B', 6, TRUE, 'CIS 4327', ARRAY['CIS 4327', 'CEN 4341', 'CAP 4773'], 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 320, NULL, 'PROGRAM_ELECTIVE_B', 6, TRUE, 'CEN 4341', ARRAY['CIS 4327', 'CEN 4341', 'CAP 4773'], 'FULL_16_WEEK', TRUE),
('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 330, NULL, 'PROGRAM_ELECTIVE_B', 6, TRUE, 'CAP 4773', ARRAY['CIS 4327', 'CEN 4341', 'CAP 4773'], 'FULL_16_WEEK', TRUE)
ON CONFLICT (program_model_id, priority) DO NOTHING;