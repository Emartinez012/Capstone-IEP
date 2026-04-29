-- ==============================================================================
-- 1. EXTENSIONS & PREREQUISITE TABLES
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
-- 3. INSERT COURSES FOR AS + BS CYBERSECURITY
-- ==============================================================================
INSERT INTO courses (course_code, title, credits) VALUES 
('CGS 1060C', 'Intro to Computer Technology', 4), ('CTS 1120', 'Cybersecurity Fundamentals', 4),
('CTS 1134', 'Networking Technologies', 4), ('MAC 1105', 'College Algebra', 3),
('CGS 1700', 'Intro to Operating Systems', 4), ('CIS 1531', 'Intro to Secure Scripting', 4),
('CTS 1111', 'Linux+', 4), ('ENC 1101', 'English Composition 1', 3),
('POS 2041', 'American Federal Government', 3), ('AST 1002', 'Descriptive Astronomy', 3),
('CET 2880C', 'Digital Forensics', 4), ('CIS 2350', 'Cybersecurity Analysis', 4),
('CTS 2314', 'Network Defense and Countermeasures', 4), ('COP 1047C', 'Intro to Python', 4),
('COP 1334', 'Intro to C++', 4), ('COP 2800', 'Java Programming', 4),
('CIS 3215', 'Ethics in Cybersecurity', 4), ('CIS 3360', 'Principles of Info Security', 4),
('ENC 1102', 'English Composition 2', 3), ('STA 2023', 'Statistical Methods', 3),
('CIS 4204', 'Ethical Hacking 1', 4), ('CIS 4366', 'Computer Forensics', 4),
('CNT 3409C', 'Network Security', 4), ('CIS 4388', 'Advanced Computer Forensics', 4),
('SPC 1017', 'Intro to Communications', 3), ('ECO 2013', 'Macroeconomics', 3),
('CIS 3361', 'Info Security Management', 4), ('CIS 4364', 'Intrusion Detection and Incident Response', 4),
('CIS 4378', 'Ethical Hacking 2', 4), ('CIS 4891', 'Cybersecurity Capstone', 4),
('BSC 1005', 'General Education Biology', 3), ('PHI 2600', 'Intro to Ethics', 3),
('CIS 2900', 'Directed IT Study', 2)
ON CONFLICT (course_code) DO NOTHING;

-- Insert the Program Model and capture its UUID
INSERT INTO program_model (id, name) 
VALUES ('c3d4e5f6-a7b8-9012-3456-789abcdef012', 'AS to BS in Cybersecurity Transition')
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 4. INSERT THE CURRICULUM SEQUENCE INTO PROGRAM_MODEL_ROW (120 Credits)
-- ==============================================================================

INSERT INTO program_model_row 
(program_model_id, priority, course_id, category, level, is_elective, default_course_id, allowed_course_ids, term_length, offered_in_summer)
VALUES
-- --- LEVEL 1: AS Foundations & Networking (Priority 10-40) ---
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 10, 'CGS 1060C', 'LOWER_DIV_TECH', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 20, 'CTS 1120', 'LOWER_DIV_TECH', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 30, 'CTS 1134', 'LOWER_DIV_TECH', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 40, 'MAC 1105', 'GEN_ED_MATH', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- LEVEL 1: AS Operating Systems & Scripting (Priority 50-80) ---
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 50, 'CGS 1700', 'LOWER_DIV_TECH', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 60, 'CIS 1531', 'LOWER_DIV_TECH', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 70, 'CTS 1111', 'LOWER_DIV_TECH', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 80, 'ENC 1101', 'GEN_ED_COMM', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- LEVEL 2: AS Gen Eds & Core Defense (Priority 90-130) ---
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 90, 'POS 2041', 'GEN_ED_SOCIAL_SCIENCE', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 100, 'AST 1002', 'GEN_ED_SCIENCE', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 110, 'CET 2880C', 'LOWER_DIV_TECH', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 120, 'CIS 2350', 'LOWER_DIV_TECH', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 130, 'CTS 2314', 'LOWER_DIV_TECH', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- LEVEL 2: AS Program Electives (Priority 140-160) ---
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 140, NULL, 'AS_ELECTIVE', 2, TRUE, 'COP 1047C', ARRAY['COP 1047C', 'CGS 2540'], 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 150, NULL, 'AS_ELECTIVE', 2, TRUE, 'COP 1334', ARRAY['COP 1334', 'CNT 4007'], 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 160, NULL, 'AS_ELECTIVE', 2, TRUE, 'COP 2800', ARRAY['COP 2800', 'CIS 2900'], 'FULL_16_WEEK', TRUE),

-- --- LEVEL 3: BS Entry & Info Security (Priority 170-200) ---
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 170, 'CIS 3215', 'MAJOR', 3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 180, 'CIS 3360', 'MAJOR', 3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 190, 'ENC 1102', 'GEN_ED_COMM', 3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 200, 'STA 2023', 'GEN_ED_MATH', 3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- LEVEL 4: BS Hacking & Forensics (Priority 210-230) ---
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 210, 'CIS 4204', 'MAJOR', 4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 220, 'CIS 4366', 'MAJOR', 4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 230, 'CNT 3409C', 'MAJOR', 4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- LEVEL 5: BS Advanced Forensics & Gen Eds (Priority 240-290) ---
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 240, 'CIS 4388', 'MAJOR', 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 250, 'SPC 1017', 'GEN_ED_ORAL_COMM', 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 260, 'ECO 2013', 'GEN_ED_SOCIAL_SCIENCE', 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 270, 'CIS 3361', 'MAJOR', 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 280, 'CIS 4364', 'MAJOR', 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 290, 'CIS 4378', 'MAJOR', 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

-- --- LEVEL 6: BS Capstone & Final Gen Eds (Priority 300-330) ---
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 300, 'CIS 4891', 'CAPSTONE', 6, FALSE, NULL, NULL, 'FULL_16_WEEK', FALSE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 310, 'BSC 1005', 'GEN_ED_SCIENCE', 6, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 320, 'PHI 2600', 'GEN_ED_HUMANITIES', 6, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
-- Final Program Elective space to close out 120 credits smoothly
('c3d4e5f6-a7b8-9012-3456-789abcdef012', 330, NULL, 'PROGRAM_ELECTIVE', 6, TRUE, 'CIS 2900', ARRAY['CIS 2900'], 'FULL_16_WEEK', TRUE)
ON CONFLICT (program_model_id, priority) DO NOTHING;