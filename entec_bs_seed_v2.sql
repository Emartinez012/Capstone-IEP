-- =============================================================================
-- entec_bs_seed_v2.sql
-- Seed data for MDC School of Engineering, Technology & Design — BS Programs
-- Target schema: iep_engine PostgreSQL 15 (Alpine)
-- Effective term: 2257 (Fall 2025)
--
-- Programs:
--   BS-AAI   Applied Artificial Intelligence           120 cr  (CIP 1101101021)
--   BS-DA    Data Analytics                            120 cr  (CIP 1101101011)
--   BS-CYB   Cybersecurity                             120 cr  (CIP 1101110031)
--   BS-ECET  Electrical & Computer Engineering Tech    134 cr  (CIP 1101503031)
--   BS-ISTN  IST – Networking Concentration            120 cr  (CIP 1101101034)
--   BS-ISTS  IST – Software Engineering Concentration  120 cr  (CIP 1101101034)
--
-- Schema conformance notes vs. v1:
--   • degree_requirements has UNIQUE (model_id, course_code) — each course
--     appears exactly once per model. All duplicate rows removed.
--   • Wildcard / elective rows removed entirely. Elective credit budgets are
--     captured only in degree_models.total_credits_required.
--   • requirement_levels populated using prereq-chain level algorithm:
--       level 1  = course has no prerequisites
--       level N  = 1 + max(level of all prerequisites)
--     A level-1 prereq may share a semester; level-2+ must be strictly earlier.
--   • Gen Ed choice categories (Humanities, Social Sciences, Natural Sciences):
--     one representative course selected per State Core slot and one per MDC
--     Core slot. See "⚠ GEN ED CHOICE" comments to swap these out.
--   • ECET duplicate catalog entries (MAC2311, MAC2312, PHY2048 appear in both
--     Gen Ed and Program Prerequisites) deduped to one row each.
--
-- Run order:  courses → degree_programs → (model + requirements + levels) per program
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. COURSES  (171 rows — all ON CONFLICT DO NOTHING)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Block 1: Communications & Humanities ─────────────────────────────────────
INSERT INTO public.courses
    (course_code, title, credits, description, prerequisite_codes, corequisite_codes)
VALUES
    ('ENC1101',  'English Composition 1',                    3, NULL, NULL,              NULL),
    ('ENC1102',  'English Composition 2',                    3, NULL, 'ENC1101',         NULL),
    ('ENC2300',  'Advanced Composition & Communication',     3, NULL, 'ENC1101,ENC1102', NULL),
    ('SPC1017',  'Introduction to Communications',           3, NULL, NULL,              NULL),
    ('SPC2608',  'Introduction to Public Speaking',          3, NULL, NULL,              NULL),
    ('ARH1000',  'Art Appreciation',                         3, NULL, NULL,              NULL),
    ('HUM1020',  'Introduction to Humanities',               3, NULL, NULL,              NULL),
    ('LIT2000',  'Introduction to Literature',               3, NULL, 'ENC1101',         NULL),
    ('MUL1010',  'Music Appreciation',                       3, NULL, NULL,              NULL),
    ('PHI2010',  'Introduction to Philosophy',               3, NULL, NULL,              NULL),
    ('THE2000',  'Theatre Appreciation',                     3, NULL, NULL,              NULL),
    ('ARC2701',  'History of Architecture 1',                3, NULL, NULL,              NULL),
    ('ARC2702',  'History of Architecture 2',                3, NULL, NULL,              NULL),
    ('ARH2050',  'Art History 1',                            3, NULL, NULL,              NULL),
    ('ARH2051',  'Art History 2',                            3, NULL, 'ARH2050',         NULL),
    ('ARH2740',  'Cinema Appreciation',                      3, NULL, NULL,              NULL),
    ('DAN2100',  'Dance Appreciation',                       3, NULL, NULL,              NULL),
    ('DAN2130',  'Dance History 1',                          3, NULL, NULL,              NULL),
    ('LIT2120',  'A Survey of World Literature',             3, NULL, 'ENC1101,ENC1102', NULL),
    ('MUH2111',  'Survey of Music History 1',                3, NULL, NULL,              NULL),
    ('MUH2112',  'Survey of Music History 2',                3, NULL, 'MUH2111',         NULL),
    ('MUL2380',  'Jazz & Popular Music in America',          3, NULL, NULL,              NULL),
    ('PHI2600',  'Introduction to Ethics',                   3, NULL, NULL,              NULL),
    ('PHI2604',  'Critical Thinking and Ethics',             3, NULL, 'ENC1101',         NULL),
    ('PHI2680',  'Artificial Intelligence and Ethics',       3, NULL, NULL,              NULL)
ON CONFLICT (course_code) DO NOTHING;

-- ── Block 2: Social Sciences ──────────────────────────────────────────────────
INSERT INTO public.courses
    (course_code, title, credits, description, prerequisite_codes, corequisite_codes)
VALUES
    ('AMH2010',  'History of the US to 1877',                3, NULL, NULL,      NULL),
    ('AMH2020',  'History of the US Since 1877',             3, NULL, NULL,      NULL),
    ('ANT2000',  'Introduction to Anthropology',             3, NULL, NULL,      NULL),
    ('ANT2410',  'Introduction to Cultural Anthropology',    3, NULL, NULL,      NULL),
    ('CLP1006',  'Psychology of Personal Effectiveness',     3, NULL, NULL,      NULL),
    ('DEP2000',  'Human Growth and Development',             3, NULL, NULL,      NULL),
    ('ECO2013',  'Principles of Economics (Macro)',          3, NULL, NULL,      NULL),
    ('ECO2023',  'Principles of Economics (Micro)',          3, NULL, 'MAT1033', NULL),
    ('POS2041',  'American Federal Government',              3, NULL, NULL,      NULL),
    ('PSY2012',  'Introduction to Psychology',               3, NULL, NULL,      NULL),
    ('SYG2000',  'Introduction to Sociology',                3, NULL, NULL,      NULL),
    ('WOH2012',  'History of World Civilization to 1789',    3, NULL, NULL,      NULL),
    ('WOH2022',  'History of World Civilization from 1789',  3, NULL, NULL,      NULL)
ON CONFLICT (course_code) DO NOTHING;

-- ── Block 3: Natural Sciences — lectures ─────────────────────────────────────
INSERT INTO public.courses
    (course_code, title, credits, description, prerequisite_codes, corequisite_codes)
VALUES
    ('AST1002',  'Descriptive Astronomy',                               3, NULL, NULL,                NULL),
    ('BOT1010',  'Botany',                                              3, NULL, NULL,                'BOT1010L'),
    ('BSC1005',  'General Education Biology',                           3, NULL, NULL,                NULL),
    ('BSC1084',  'Functional Human Anatomy',                            3, NULL, NULL,                NULL),
    ('BSC2010',  'Principles of Biology 1',                             3, NULL, 'CHM1045',           'BSC2010L'),
    ('BSC2011',  'Principles of Biology 2',                             3, NULL, 'BSC2010,BSC2010L',  'BSC2011L'),
    ('BSC2020',  'Human Biology: Fund. of Anatomy & Physiology',        3, NULL, NULL,                NULL),
    ('BSC2085',  'Human Anatomy and Physiology 1',                      3, NULL, NULL,                'BSC2085L'),
    ('CHM1020',  'General Education Chemistry',                         3, NULL, NULL,                NULL),
    ('CHM1025',  'Introductory Chemistry',                              3, NULL, 'MAT1033',           NULL),
    ('CHM1033',  'Chemistry for Health Sciences',                       3, NULL, 'MAT1033',           'CHM1033L'),
    ('CHM1045',  'General Chemistry and Qualitative Analysis 1',        3, NULL, 'CHM1025,MAC1105',   'CHM1045L'),
    ('CHM1046',  'General Chemistry and Qualitative Analysis 2',        3, NULL, 'CHM1045',           'CHM1046L'),
    ('CHM2200',  'Survey of Organic Chemistry',                         3, NULL, 'CHM1046,CHM1046L',  'CHM2200L'),
    ('CHM2210',  'Organic Chemistry 1',                                 3, NULL, 'CHM1046,CHM1046L',  'CHM2210L'),
    ('CHM2211',  'Organic Chemistry 2',                                 3, NULL, 'CHM2210,CHM2210L',  'CHM2211L'),
    ('ESC1000',  'General Education Earth Science',                     3, NULL, NULL,                NULL),
    ('EVR1001',  'Introduction to Environmental Sciences',              3, NULL, NULL,                NULL),
    ('GLY1010',  'Physical Geology',                                    3, NULL, NULL,                NULL),
    ('GLY1100',  'Historical Geology',                                  3, NULL, NULL,                NULL),
    ('HUN1201',  'Essentials of Human Nutrition',                       3, NULL, NULL,                NULL),
    ('MET1010',  'Introduction to Weather',                             3, NULL, NULL,                'PSC1515'),
    ('OCB1010',  'Introduction to Marine Biology',                      3, NULL, NULL,                NULL),
    ('OCE1001',  'Introduction to Oceanography',                        3, NULL, NULL,                NULL),
    ('PCB2033',  'Introduction to Ecology',                             3, NULL, 'PSC1515,BSC2011',   NULL),
    ('PHY1004',  'Physics with Applications 1',                         3, NULL, 'MAT1033',           'PHY1004L'),
    ('PHY1020',  'General Education Physics',                           3, NULL, NULL,                NULL),
    ('PHY1025',  'Basic Physics',                                       3, NULL, 'MAC1105',           NULL),
    ('PHY2048',  'Physics with Calculus 1',                             4, NULL, 'PHY1025,MAC2311',   'PHY2048L'),
    ('PHY2049',  'Physics with Calculus 2',                             4, NULL, 'PHY2048,PHY2048L',  'PHY2049L,MAC2312'),
    ('PHY2053',  'Physics (without Calculus) 1',                        3, NULL, 'MAC1114,MAC1147',   'PHY2053L'),
    ('PHY2054',  'Physics (without Calculus) 2',                        3, NULL, 'PHY2053',           'PHY2054L'),
    ('PSC1121',  'General Education Physical Science',                  3, NULL, 'MAT1033',           NULL),
    ('PSC1515',  'Energy in the Natural Environment',                   3, NULL, NULL,                NULL)
ON CONFLICT (course_code) DO NOTHING;

-- ── Block 3 cont.: Natural Sciences — standalone labs ────────────────────────
INSERT INTO public.courses
    (course_code, title, credits, description, prerequisite_codes, corequisite_codes)
VALUES
    ('BOT1010L',  'Botany Lab',                                         1, NULL, NULL,                        'BOT1010'),
    ('BSC2010L',  'Principles of Biology 1 Lab',                        2, NULL, 'CHM1045',                   'BSC2010'),
    ('BSC2011L',  'Principles of Biology 2 Lab',                        2, NULL, 'BSC2010,BSC2010L',          'BSC2011'),
    ('BSC2085L',  'Human Anatomy and Physiology 1 Lab',                 1, NULL, NULL,                        'BSC2085'),
    ('CHM1033L',  'Chemistry for Health Sciences Lab',                  1, NULL, 'MAT1033',                   'CHM1033'),
    ('CHM1045L',  'General Chemistry and Qualitative Analysis 1 Lab',   1, NULL, 'CHM1025,MAC1105',           'CHM1045'),
    ('CHM1046L',  'General Chemistry and Qualitative Analysis 2 Lab',   1, NULL, 'CHM1045',                   'CHM1046'),
    ('CHM2200L',  'Survey of Organic Chemistry Lab',                    1, NULL, 'CHM1046,CHM1046L',          'CHM2200'),
    ('CHM2210L',  'Organic Chemistry 1 Lab',                            1, NULL, 'CHM1046,CHM1046L',          'CHM2210'),
    ('CHM2211L',  'Organic Chemistry 2 Lab',                            1, NULL, 'CHM2210,CHM2210L',          'CHM2211'),
    ('PHY1004L',  'Physics with Applications 1 Lab',                    1, NULL, 'MAT1033',                   'PHY1004'),
    ('PHY2048L',  'Physics with Calculus 1 Lab',                        1, NULL, 'PHY1025,MAC2311',           'PHY2048'),
    ('PHY2049L',  'Physics with Calculus 2 Lab',                        1, NULL, 'PHY2048,PHY2048L',          'PHY2049'),
    ('PHY2053L',  'Physics (without Calculus) 1 Lab',                   1, NULL, 'MAC1114,MAC1147',           'PHY2053'),
    ('PHY2054L',  'Physics (without Calculus) 2 Lab',                   1, NULL, 'PHY2053',                   'PHY2054')
ON CONFLICT (course_code) DO NOTHING;

-- ── Block 4: Mathematics ──────────────────────────────────────────────────────
INSERT INTO public.courses
    (course_code, title, credits, description, prerequisite_codes, corequisite_codes)
VALUES
    ('MAT1033',   'Intermediate Algebra',                                 3, NULL, NULL,             NULL),
    ('MGF1130',   'Mathematical Thinking',                                3, NULL, NULL,             NULL),
    ('MGF1131',   'Mathematics in Context',                               3, NULL, NULL,             NULL),
    ('MAC1105',   'College Algebra',                                      3, NULL, NULL,             NULL),
    ('MAC1106',   'Integrated College and Precalculus Algebra',           5, NULL, 'MAT1033',        NULL),
    ('MAC1114',   'Trigonometry',                                         3, NULL, 'MAC1105,MAC1106', NULL),
    ('MAC1140',   'Pre-Calculus Algebra',                                 3, NULL, 'MAC1105',        NULL),
    ('MAC1147',   'Pre-Calculus Algebra and Trigonometry',                5, NULL, 'MAC1105',        NULL),
    ('MAC2233',   'Business Calculus',                                    3, NULL, 'MAC1105,MAC1106', NULL),
    ('MAC2311',   'Calculus and Analytical Geometry 1',                   5, NULL, 'MAC1106,MAC1114', NULL),
    ('MAC2312',   'Calculus and Analytical Geometry 2',                   4, NULL, 'MAC2311',        NULL),
    ('MAC2313',   'Calculus and Analytic Geometry 3',                     4, NULL, 'MAC2312',        NULL),
    ('MAD1100',   'Discrete Mathematics for Computer Science',            3, NULL, 'MAC1105',        NULL),
    ('MAD2104',   'Discrete Mathematics',                                 3, NULL, 'MAC1106,MAC1140', NULL),
    ('MAP2302',   'Introduction to Differential Equations',               3, NULL, 'MAC2312',        NULL),
    ('MAS2103',   'Elementary Linear Algebra',                            3, NULL, 'MAC2311',        NULL),
    ('QMB2100',   'Basic Business Statistics',                            3, NULL, NULL,             NULL),
    ('STA2023',   'Statistical Methods',                                  3, NULL, 'MAT1033,MGF1131', NULL),
    ('CGS1060C',  'Introduction to Computer Technology & Applications',   4, NULL, NULL,             NULL)
ON CONFLICT (course_code) DO NOTHING;

-- ── Block 5: Data Analytics ───────────────────────────────────────────────────
INSERT INTO public.courses
    (course_code, title, credits, description, prerequisite_codes, corequisite_codes)
VALUES
    ('CAP1788',   'Introduction to Data Analytics',           4, NULL, NULL,                       NULL),
    ('CGS1540C',  'Database Concepts and Design',             4, NULL, NULL,                       NULL),
    ('COP1047C',  'Introduction to Python Programming',       4, NULL, NULL,                       NULL),
    ('CAP2761C',  'Intermediate Analytics',                   4, NULL, 'CAP1788,CGS1540C',         NULL),
    ('CAP3321C',  'Data Wrangling',                           4, NULL, 'CAP1788,CAP2761C',         NULL),
    ('CAP3330',   'Programming R for Statistics',             4, NULL, 'STA2023',                  NULL),
    ('STA3164',   'Statistical Methods II',                   4, NULL, 'STA2023',                  NULL),
    ('CAP4631C',  'Machine Learning for Data Analytics I',    4, NULL, 'COP1047C,STA3164',         NULL),
    ('CAP4633C',  'Machine Learning for Data Analytics II',   4, NULL, 'CAP4631C',                 NULL),
    ('CAP4744',   'Data Visualization',                       4, NULL, 'CAP1788,CAP2761C',         NULL),
    ('CAP4767',   'Data Mining',                              4, NULL, 'CAP1788,CAP2761C',         NULL),
    ('CAP4784',   'Big Data',                                 4, NULL, 'CAP1788,CAP2761C',         NULL),
    ('CAP4910',   'Data Analytics Capstone',                  4, NULL, NULL,                       NULL),
    ('CAP4936',   'Special Topics in Data Analytics',         4, NULL, NULL,                       NULL),
    ('CIS3368',   'Data Security & Governance',               4, NULL, NULL,                       NULL)
ON CONFLICT (course_code) DO NOTHING;

-- ── Block 6: Cybersecurity ────────────────────────────────────────────────────
INSERT INTO public.courses
    (course_code, title, credits, description, prerequisite_codes, corequisite_codes)
VALUES
    ('CTS1111',   'Linux+',                                       4, NULL, 'CGS1060C',        NULL),
    ('CTS1120',   'Cybersecurity Fundamentals',                   4, NULL, NULL,              NULL),
    ('CTS1134',   'Networking Technologies',                      4, NULL, NULL,              NULL),
    ('CIS1531',   'Introduction to Secure Scripting',             4, NULL, NULL,              NULL),
    ('COP1334',   'Introduction to C++ Programming',              4, NULL, 'CGS1060C',        NULL),
    ('CIS3215',   'Ethics in Cybersecurity',                      4, NULL, NULL,              NULL),
    ('CIS3360',   'Principles of Information Security',           4, NULL, 'CTS1134,CTS1650', NULL),
    ('CIS3361',   'Information Security Management',              4, NULL, 'CIS3360',         NULL),
    ('CIS4204',   'Ethical Hacking I',                            4, NULL, 'CIS3360',         NULL),
    ('CIS4378',   'Ethical Hacking II',                           4, NULL, 'CIS4204',         NULL),
    ('CIS4364',   'Intrusion Detection and Incident Response',    4, NULL, 'CIS3360',         NULL),
    ('CIS4366',   'Computer Forensics',                           4, NULL, 'CIS3360',         NULL),
    ('CIS4388',   'Advanced Computer Forensics',                  4, NULL, 'CIS4366',         NULL),
    ('CIS4891',   'Cybersecurity Capstone Project',               4, NULL, NULL,              NULL)
ON CONFLICT (course_code) DO NOTHING;

-- ── Block 7: Electrical & Computer Engineering Technology ────────────────────
INSERT INTO public.courses
    (course_code, title, credits, description, prerequisite_codes, corequisite_codes)
VALUES
    ('COP2270',   'C for Engineers',                                4, NULL, 'MAC1105',                            NULL),
    ('EET1015C',  'Direct Current Circuits',                        4, NULL, 'MAC1105',                            NULL),
    ('EET1025C',  'Alternating Current Circuits',                   4, NULL, 'EET1015C',                           'MAC1114,MAC1147'),
    ('EET1141C',  'Electronics 1',                                  4, NULL, 'EET1025C,MAC1114,MAC1147',            NULL),
    ('EET2101C',  'Electronics 2',                                  4, NULL, 'EET1141C',                           NULL),
    ('EET2323C',  'Analog Communications',                          4, NULL, 'EET1141C',                           NULL),
    ('CET1110C',  'Digital Circuits',                               4, NULL, 'EET1015C,MAC1105',                   'COP2270'),
    ('CET2113C',  'Advanced Digital Circuits',                      4, NULL, 'CET1110C,COP2270',                   NULL),
    ('CET2123C',  'Microprocessors',                                4, NULL, 'CET1110C,COP2270',                   NULL),
    ('EET2351C',  'Digital and Data Communications',                4, NULL, 'CET2123C',                           NULL),
    ('ETI2670',   'Engineering Economic Analysis',                  3, NULL, 'MAC1105',                            NULL),
    ('ETS2673C',  'Programmable Logic Controls',                    4, NULL, 'CET1110C',                           NULL),
    ('CET3126C',  'Computer Architecture',                          4, NULL, NULL,                                 NULL),
    ('EET3716C',  'Advanced System Analysis',                       4, NULL, 'EET1025C,MAC2312',                   NULL),
    ('EET4158C',  'Linear Integrated Circuits',                     4, NULL, 'EET3716C',                           NULL),
    ('EET4165C',  'Senior Design 1',                                3, NULL, NULL,                                 NULL),
    ('EET4166C',  'Senior Design 2',                                2, NULL, 'EET4165C',                           NULL),
    ('EET4730C',  'Feedback Control Systems',                       4, NULL, 'EET3716C',                           NULL),
    ('EET4732C',  'Signals and Systems',                            4, NULL, 'EET3716C',                           NULL),
    ('ETI4480C',  'Applied Robotics',                               4, NULL, 'CET3126C',                           NULL),
    ('ETP3240',   'Power Systems',                                  3, NULL, 'EET1025C',                           NULL),
    ('ETP3320',   'Introduction to Renewable Energy Technology',    3, NULL, 'EET2101C',                           NULL),
    ('CET4190C',  'Applied Digital Signal Processing',              4, NULL, 'COP2270,EET4732C,EET2323C,EET2351C', NULL),
    ('CET4663C',  'Electronic Security',                            3, NULL, 'CET2123C,COP2270',                   NULL)
ON CONFLICT (course_code) DO NOTHING;

-- ── Block 8: IST — shared (Networking + Software Engineering) ────────────────
INSERT INTO public.courses
    (course_code, title, credits, description, prerequisite_codes, corequisite_codes)
VALUES
    ('CTS1650',   'CCNA: Cisco Fundamentals',                 4, NULL, NULL,              NULL),
    ('CGS3763',   'Operating System Principles',              4, NULL, 'COP1334',         NULL),
    ('CIS3510',   'IT Project Management',                    4, NULL, NULL,              NULL),
    ('CIS4347',   'Information Storage Management',           4, NULL, 'CGS1540C',        NULL),
    ('CNT3409C',  'Network Security',                         4, NULL, 'CIS3360',         NULL),
    ('CNT3526C',  'Wireless and Mobile Networking',           4, NULL, 'CTS1134,CTS1650', NULL),
    ('CNT4603',   'System Administration and Maintenance',    4, NULL, 'CTS1134,CTS1650', NULL),
    ('CNT4702',   'Network Design and Planning',              4, NULL, 'CIS3360',         NULL),
    ('CTS4955',   'Networking Capstone',                      4, NULL, NULL,              NULL)
ON CONFLICT (course_code) DO NOTHING;

-- ── Block 9: IST — Software Engineering only ─────────────────────────────────
INSERT INTO public.courses
    (course_code, title, credits, description, prerequisite_codes, corequisite_codes)
VALUES
    ('COP2800',   'Java Programming',                       4, NULL, 'COP1334,COP2270',  NULL),
    ('CET3383C',  'Software Engineering I',                 4, NULL, 'COP2800',          NULL),
    ('CEN4025C',  'Software Engineering II',                4, NULL, 'CET3383C',         NULL),
    ('CEN4090C',  'Software Engineering Capstone',          4, NULL, NULL,               NULL),
    ('COP3530',   'Data Structures',                        4, NULL, 'COP2800',          NULL),
    ('COT4400',   'Design and Analysis of Algorithms',      4, NULL, 'COP2800',          'COP3530')
ON CONFLICT (course_code) DO NOTHING;

-- ── Block 10: Applied Artificial Intelligence ─────────────────────────────────
INSERT INTO public.courses
    (course_code, title, credits, description, prerequisite_codes, corequisite_codes)
VALUES
    ('CAI1001C',  'Artificial Intelligence (AI) Thinking',           3, NULL, NULL,                                  NULL),
    ('CAI2100C',  'Machine Learning Foundations',                    3, NULL, 'CAI1001C,COP1047C',                   NULL),
    ('CAI2300C',  'Introduction to Natural Language Processing',     3, NULL, 'CAI2100C',                            NULL),
    ('CAI2840C',  'Introduction to Computer Vision',                 3, NULL, 'CAI2100C',                            NULL),
    ('CAI2820C',  'AI Applications Solutions',                       3, NULL, 'CAI2300C,CAI2840C',                   NULL),
    ('CAI3303C',  'Natural Language Processing',                     3, NULL, 'CAI2300C',                            NULL),
    ('CAI3821C',  'Computational Methods for AI 1',                  3, NULL, 'CAI2100C,COP1047C,MAC1105,STA2023',   NULL),
    ('CAI3822C',  'Computational Methods for AI 2',                  3, NULL, 'CAI3821C',                            NULL),
    ('CAI4505C',  'Artificial Intelligence',                         3, NULL, 'CAI3822C,COP3530',                    NULL),
    ('CAI4510C',  'Machine Intelligence',                            3, NULL, 'CAI3822C,COP3530',                    NULL),
    ('CAI4420C',  'Applied Decision and Optimization Theory',        3, NULL, 'CAI4505C',                            NULL),
    ('CAI4525C',  'AI Systems Automation',                           3, NULL, 'CAI4505C,CAI4510C',                   NULL),
    ('CAI4830C',  'Simulation for Applied AI',                       3, NULL, NULL,                                  'CAI4505C'),
    ('CAI4950C',  'Artificial Intelligence Capstone',                3, NULL, 'CAI4510C,CAI4420C,CAI4830C',          'CAI4525C'),
    ('GEB1432',   'Applied AI in Business',                          3, NULL, NULL,                                  NULL),
    ('HSC2060',   'AI Applications in Healthcare',                   3, NULL, NULL,                                  NULL),
    ('ETS1603C',  'Introduction to Robotics',                        4, NULL, NULL,                                  NULL),
    ('CTS1145',   'Cloud Essentials',                                4, NULL, NULL,                                  NULL)
ON CONFLICT (course_code) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DEGREE PROGRAMS
-- ─────────────────────────────────────────────────────────────────────────────
-- dept_id left NULL — link after inserting the EnTec department row.

INSERT INTO public.degree_programs (degree_code, program_name, department_name, dept_id)
VALUES
    ('BS-AAI',  'Bachelor of Science in Applied Artificial Intelligence',                   'School of Engineering, Technology, and Design', NULL),
    ('BS-DA',   'Bachelor of Science in Data Analytics',                                    'School of Engineering, Technology, and Design', NULL),
    ('BS-CYB',  'Bachelor of Science in Cybersecurity',                                     'School of Engineering, Technology, and Design', NULL),
    ('BS-ECET', 'Bachelor of Science in Electrical and Computer Engineering Technology',    'School of Engineering, Technology, and Design', NULL),
    ('BS-ISTN', 'Bachelor of Science in Information Systems Technology - Networking',       'School of Engineering, Technology, and Design', NULL),
    ('BS-ISTS', 'Bachelor of Science in Information Systems Technology - Software Engineering', 'School of Engineering, Technology, and Design', NULL)
ON CONFLICT (degree_code) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DEGREE MODELS  +  DEGREE REQUIREMENTS  +  REQUIREMENT LEVELS
--
-- Pattern per program:
--   WITH m  AS (INSERT INTO degree_models    ... RETURNING model_id)
--      , req AS (INSERT INTO degree_requirements ... RETURNING requirement_id, course_code)
--   INSERT INTO requirement_levels
--     SELECT req.requirement_id, lv.level_value
--     FROM req JOIN (VALUES ...) AS lv(course_code, level_value)
--       ON req.course_code = lv.course_code;
--
-- priority_value  = academic level (same as level_value; stored on req for
--                   fast ordering without joining requirement_levels)
-- level_value     = prereq-chain depth (see header comment)
--
-- ⚠ GEN ED CHOICE COURSES — one representative selected per slot.
--   Swap the course_code in VALUES to any other catalog option for that slot.
--   Humanities  State Core  → ARH1000  (Art Appreciation)
--   Humanities  MDC Core    → DAN2100  (Dance Appreciation — MDC Core only)
--   Social Sci  State Core  → POS2041  (American Fed. Govt — satisfies Civic Lit.)
--   Social Sci  MDC Core    → PSY2012  (Introduction to Psychology)
--   Natural Sci State Core  → AST1002  (Descriptive Astronomy) [ECET: PHY2048]
--   Natural Sci MDC Core    → PHY1020  (General Education Physics) [ECET: PHY2049]
--   Gen Ed Elective         → ECO2013  (Macroeconomics) [ECET: PHY2049L]
-- ─────────────────────────────────────────────────────────────────────────────


-- ══════════════════════════════════════════════════════════════════════════════
-- PROGRAM 1: Applied Artificial Intelligence (BS-AAI) — 120 credits
-- Fixed requirements: 31 courses
-- Elective budget absorbed into total_credits_required (120)
-- ══════════════════════════════════════════════════════════════════════════════
WITH m AS (
    INSERT INTO public.degree_models
        (degree_code, total_credits_required, is_published, version_number, created_by, effective_term)
    VALUES ('BS-AAI', 120, false, 1, NULL, '2257')
    RETURNING model_id
),
req AS (
    INSERT INTO public.degree_requirements (model_id, course_code, priority_value, is_wildcard)
    SELECT m.model_id, c.cc, c.pv, false
    FROM m,
    (VALUES
        -- Gen Ed: Communications
        ('ENC1101',  1),  ('ENC1102',  2),  ('SPC1017',  1),
        -- Gen Ed: Humanities  ⚠ GEN ED CHOICE
        ('ARH1000',  1),  ('DAN2100',  1),
        -- Gen Ed: Social Sciences  ⚠ GEN ED CHOICE
        ('POS2041',  1),  ('PSY2012',  1),
        -- Gen Ed: Natural Sciences  ⚠ GEN ED CHOICE
        ('AST1002',  1),  ('PHY1020',  1),
        -- Gen Ed: Mathematics  ⚠ GEN ED CHOICE
        ('MAC1105',  1),  ('STA2023',  2),
        -- Gen Ed: Elective  ⚠ GEN ED CHOICE
        ('ECO2013',  1),
        -- Computer Competency
        ('CGS1060C', 1),
        -- Lower Division Tech — Group A
        ('CAI1001C', 1),  ('COP1047C', 1),  ('CAI2100C', 2),  ('CAI2300C', 3),
        -- Lower Division Tech — Group B
        ('CAI2840C', 3),  ('COP2800',  3),  ('PHI2680',  1),
        -- Program Core
        ('CAI3303C', 4),  ('CAI3821C', 3),  ('CAI3822C', 4),
        ('CAI4505C', 5),  ('CAI4510C', 5),  ('CAI4420C', 6),
        ('CAI4525C', 6),  ('CAI4830C', 1),  ('CAI4950C', 7),
        ('COP3530',  4),
        -- Upper Division Statistics  ⚠ alt: STA3164
        ('CAP3330',  3)
    ) AS c(cc, pv)
    RETURNING requirement_id, course_code
)
INSERT INTO public.requirement_levels (requirement_id, level_value)
SELECT req.requirement_id, lv.lv
FROM req
JOIN (VALUES
    ('ENC1101',  1), ('ENC1102',  2), ('SPC1017',  1),
    ('ARH1000',  1), ('DAN2100',  1),
    ('POS2041',  1), ('PSY2012',  1),
    ('AST1002',  1), ('PHY1020',  1),
    ('MAC1105',  1), ('STA2023',  2),
    ('ECO2013',  1), ('CGS1060C', 1),
    ('CAI1001C', 1), ('COP1047C', 1), ('CAI2100C', 2), ('CAI2300C', 3),
    ('CAI2840C', 3), ('COP2800',  3), ('PHI2680',  1),
    ('CAI3303C', 4), ('CAI3821C', 3), ('CAI3822C', 4),
    ('CAI4505C', 5), ('CAI4510C', 5), ('CAI4420C', 6),
    ('CAI4525C', 6), ('CAI4830C', 1), ('CAI4950C', 7),
    ('COP3530',  4), ('CAP3330',  3)
) AS lv(cc, lv) ON req.course_code = lv.cc;


-- ══════════════════════════════════════════════════════════════════════════════
-- PROGRAM 2: Data Analytics (BS-DA) — 120 credits
-- Fixed requirements: 26 courses
-- ══════════════════════════════════════════════════════════════════════════════
WITH m AS (
    INSERT INTO public.degree_models
        (degree_code, total_credits_required, is_published, version_number, created_by, effective_term)
    VALUES ('BS-DA', 120, false, 1, NULL, '2257')
    RETURNING model_id
),
req AS (
    INSERT INTO public.degree_requirements (model_id, course_code, priority_value, is_wildcard)
    SELECT m.model_id, c.cc, c.pv, false
    FROM m,
    (VALUES
        -- Gen Ed: Communications
        ('ENC1101',  1),  ('ENC1102',  2),  ('SPC1017',  1),
        -- Gen Ed: Humanities  ⚠ GEN ED CHOICE
        ('ARH1000',  1),  ('DAN2100',  1),
        -- Gen Ed: Social Sciences  ⚠ GEN ED CHOICE
        ('POS2041',  1),  ('PSY2012',  1),
        -- Gen Ed: Natural Sciences  ⚠ GEN ED CHOICE
        ('AST1002',  1),  ('PHY1020',  1),
        -- Gen Ed: Mathematics  ⚠ GEN ED CHOICE
        ('MAC1105',  1),  ('STA2023',  2),
        -- Gen Ed: Elective  ⚠ GEN ED CHOICE
        ('ECO2013',  1),
        -- Computer Competency
        ('CGS1060C', 1),
        -- Lower Division Tech Group A
        ('CAP1788',  1),  ('CGS1540C', 1),  ('COP1047C', 1),  ('CAP2761C', 2),
        -- Upper Division Program Core
        ('CAP3321C', 3),
        -- Upper Division Stats  ⚠ alt: STA3164
        ('CAP3330',  3),
        ('CAP4631C', 4),  ('CAP4633C', 5),  ('CAP4744',  3),
        ('CAP4767',  3),  ('CAP4784',  3),  ('CAP4910',  1),
        -- Topics in Data Analytics (CIS3368 is a fixed course; CAP4936 is dept-approval)
        ('CIS3368',  1)
    ) AS c(cc, pv)
    RETURNING requirement_id, course_code
)
INSERT INTO public.requirement_levels (requirement_id, level_value)
SELECT req.requirement_id, lv.lv
FROM req
JOIN (VALUES
    ('ENC1101',  1), ('ENC1102',  2), ('SPC1017',  1),
    ('ARH1000',  1), ('DAN2100',  1),
    ('POS2041',  1), ('PSY2012',  1),
    ('AST1002',  1), ('PHY1020',  1),
    ('MAC1105',  1), ('STA2023',  2),
    ('ECO2013',  1), ('CGS1060C', 1),
    ('CAP1788',  1), ('CGS1540C', 1), ('COP1047C', 1), ('CAP2761C', 2),
    ('CAP3321C', 3), ('CAP3330',  3),
    ('CAP4631C', 4), ('CAP4633C', 5), ('CAP4744',  3),
    ('CAP4767',  3), ('CAP4784',  3), ('CAP4910',  1),
    ('CIS3368',  1)
) AS lv(cc, lv) ON req.course_code = lv.cc;


-- ══════════════════════════════════════════════════════════════════════════════
-- PROGRAM 3: Cybersecurity (BS-CYB) — 120 credits
-- Fixed requirements: 26 courses
-- ══════════════════════════════════════════════════════════════════════════════
WITH m AS (
    INSERT INTO public.degree_models
        (degree_code, total_credits_required, is_published, version_number, created_by, effective_term)
    VALUES ('BS-CYB', 120, false, 1, NULL, '2257')
    RETURNING model_id
),
req AS (
    INSERT INTO public.degree_requirements (model_id, course_code, priority_value, is_wildcard)
    SELECT m.model_id, c.cc, c.pv, false
    FROM m,
    (VALUES
        -- Gen Ed: Communications
        ('ENC1101',  1),  ('ENC1102',  2),  ('SPC1017',  1),
        -- Gen Ed: Humanities  ⚠ GEN ED CHOICE
        ('ARH1000',  1),  ('DAN2100',  1),
        -- Gen Ed: Social Sciences  ⚠ GEN ED CHOICE
        ('POS2041',  1),  ('PSY2012',  1),
        -- Gen Ed: Natural Sciences  ⚠ GEN ED CHOICE
        ('AST1002',  1),  ('PHY1020',  1),
        -- Gen Ed: Mathematics  ⚠ GEN ED CHOICE
        ('MAC1105',  1),  ('STA2023',  2),
        -- Gen Ed: Elective  ⚠ GEN ED CHOICE
        ('ECO2013',  1),
        -- Computer Competency (also Lower Div prereq)
        ('CGS1060C', 1),
        -- Lower Division Group A
        ('CTS1111',  2),  ('CTS1120',  1),  ('CTS1134',  1),
        -- Lower Division Group B  ⚠ alt: COP1047C or COP1334
        ('CIS1531',  1),
        -- Upper Division Core
        ('CIS3215',  1),  ('CIS3360',  2),  ('CIS3361',  3),
        ('CIS4204',  3),  ('CIS4378',  4),  ('CIS4364',  3),
        ('CIS4366',  3),  ('CIS4388',  4),  ('CIS4891',  1)
    ) AS c(cc, pv)
    RETURNING requirement_id, course_code
)
INSERT INTO public.requirement_levels (requirement_id, level_value)
SELECT req.requirement_id, lv.lv
FROM req
JOIN (VALUES
    ('ENC1101',  1), ('ENC1102',  2), ('SPC1017',  1),
    ('ARH1000',  1), ('DAN2100',  1),
    ('POS2041',  1), ('PSY2012',  1),
    ('AST1002',  1), ('PHY1020',  1),
    ('MAC1105',  1), ('STA2023',  2),
    ('ECO2013',  1), ('CGS1060C', 1),
    ('CTS1111',  2), ('CTS1120',  1), ('CTS1134',  1),
    ('CIS1531',  1),
    ('CIS3215',  1), ('CIS3360',  2), ('CIS3361',  3),
    ('CIS4204',  3), ('CIS4378',  4), ('CIS4364',  3),
    ('CIS4366',  3), ('CIS4388',  4), ('CIS4891',  1)
) AS lv(cc, lv) ON req.course_code = lv.cc;


-- ══════════════════════════════════════════════════════════════════════════════
-- PROGRAM 4: Electrical & Computer Engineering Technology (BS-ECET) — 134 credits
-- Fixed requirements: 37 courses
-- Deduplication: MAC2311, MAC2312, PHY2048 appear in both Gen Ed and Program
-- Prerequisites in the catalog — one row each (Gen Ed section wins).
-- ══════════════════════════════════════════════════════════════════════════════
WITH m AS (
    INSERT INTO public.degree_models
        (degree_code, total_credits_required, is_published, version_number, created_by, effective_term)
    VALUES ('BS-ECET', 134, false, 1, NULL, '2257')
    RETURNING model_id
),
req AS (
    INSERT INTO public.degree_requirements (model_id, course_code, priority_value, is_wildcard)
    SELECT m.model_id, c.cc, c.pv, false
    FROM m,
    (VALUES
        -- Gen Ed: Communications
        ('ENC1101',  1),  ('ENC1102',  2),  ('SPC1017',  1),
        -- Gen Ed: Humanities  ⚠ GEN ED CHOICE
        ('ARH1000',  1),  ('DAN2100',  1),
        -- Gen Ed: Social Sciences  ⚠ GEN ED CHOICE
        ('POS2041',  1),  ('PSY2012',  1),
        -- Gen Ed: Natural Sciences — ECET requires PHY2048/PHY2049 specifically
        ('PHY2048',  4),  ('PHY2049',  5),
        -- Gen Ed: Mathematics — MAC2311/MAC2312 are required for ECET
        ('MAC2311',  3),  ('MAC2312',  4),
        -- Gen Ed: Elective — PHY2049L as listed in ECET catalog sheet
        ('PHY2049L', 5),
        -- Program Prerequisites (MAC2311, MAC2312, PHY2048 already above — deduped)
        ('PHY2048L', 4),
        -- Lower Division Requirements
        ('MAC1114',  2),  ('COP2270',  2),
        ('EET1015C', 2),  ('EET1025C', 3),  ('EET1141C', 4),
        ('EET2101C', 5),  ('EET2323C', 5),
        ('CET1110C', 3),  ('CET2113C', 4),  ('CET2123C', 4),
        ('EET2351C', 5),  ('ETI2670',  2),  ('ETS2673C', 4),
        ('MAP2302',  5),
        -- Upper Division Requirements
        ('CET3126C', 1),  ('EET3716C', 5),
        ('EET4158C', 6),  ('EET4165C', 1),  ('EET4166C', 2),
        ('EET4730C', 6),  ('EET4732C', 6),  ('ETI4480C', 2),
        -- Program Electives — one from each group (required pick)
        -- Group A  ⚠ alt: ETP3320
        ('ETP3240',  4),
        -- Group B  ⚠ alt: CET4663C
        ('CET4190C', 7)
    ) AS c(cc, pv)
    RETURNING requirement_id, course_code
)
INSERT INTO public.requirement_levels (requirement_id, level_value)
SELECT req.requirement_id, lv.lv
FROM req
JOIN (VALUES
    ('ENC1101',  1), ('ENC1102',  2), ('SPC1017',  1),
    ('ARH1000',  1), ('DAN2100',  1),
    ('POS2041',  1), ('PSY2012',  1),
    ('PHY2048',  4), ('PHY2049',  5),
    ('MAC2311',  3), ('MAC2312',  4),
    ('PHY2049L', 5), ('PHY2048L', 4),
    ('MAC1114',  2), ('COP2270',  2),
    ('EET1015C', 2), ('EET1025C', 3), ('EET1141C', 4),
    ('EET2101C', 5), ('EET2323C', 5),
    ('CET1110C', 3), ('CET2113C', 4), ('CET2123C', 4),
    ('EET2351C', 5), ('ETI2670',  2), ('ETS2673C', 4),
    ('MAP2302',  5),
    ('CET3126C', 1), ('EET3716C', 5),
    ('EET4158C', 6), ('EET4165C', 1), ('EET4166C', 2),
    ('EET4730C', 6), ('EET4732C', 6), ('ETI4480C', 2),
    ('ETP3240',  4), ('CET4190C', 7)
) AS lv(cc, lv) ON req.course_code = lv.cc;


-- ══════════════════════════════════════════════════════════════════════════════
-- PROGRAM 5: IST – Networking Concentration (BS-ISTN) — 120 credits
-- Fixed requirements: 25 courses
-- ══════════════════════════════════════════════════════════════════════════════
WITH m AS (
    INSERT INTO public.degree_models
        (degree_code, total_credits_required, is_published, version_number, created_by, effective_term)
    VALUES ('BS-ISTN', 120, false, 1, NULL, '2257')
    RETURNING model_id
),
req AS (
    INSERT INTO public.degree_requirements (model_id, course_code, priority_value, is_wildcard)
    SELECT m.model_id, c.cc, c.pv, false
    FROM m,
    (VALUES
        -- Gen Ed: Communications
        ('ENC1101',  1),  ('ENC1102',  2),  ('SPC1017',  1),
        -- Gen Ed: Humanities  ⚠ GEN ED CHOICE
        ('ARH1000',  1),  ('DAN2100',  1),
        -- Gen Ed: Social Sciences  ⚠ GEN ED CHOICE
        ('POS2041',  1),  ('PSY2012',  1),
        -- Gen Ed: Natural Sciences  ⚠ GEN ED CHOICE
        ('AST1002',  1),  ('PHY1020',  1),
        -- Gen Ed: Mathematics  ⚠ GEN ED CHOICE
        ('MAC1105',  1),  ('STA2023',  2),
        -- Gen Ed: Elective  ⚠ GEN ED CHOICE
        ('ECO2013',  1),
        -- Computer Competency (also Lower Div Group A prereq)
        ('CGS1060C', 1),
        -- Lower Division Group A
        ('CGS1540C', 1),  ('COP1334',  2),
        -- Lower Division Group B  ⚠ alt: CTS1650
        ('CTS1134',  1),
        -- Upper Division Professional Core
        ('CGS3763',  3),  ('CIS3360',  2),  ('CIS3510',  1),
        -- Upper Division Discipline Content
        ('CIS4347',  2),  ('CNT3409C', 3),  ('CNT3526C', 2),
        ('CNT4603',  2),  ('CNT4702',  3),  ('CTS4955',  1)
    ) AS c(cc, pv)
    RETURNING requirement_id, course_code
)
INSERT INTO public.requirement_levels (requirement_id, level_value)
SELECT req.requirement_id, lv.lv
FROM req
JOIN (VALUES
    ('ENC1101',  1), ('ENC1102',  2), ('SPC1017',  1),
    ('ARH1000',  1), ('DAN2100',  1),
    ('POS2041',  1), ('PSY2012',  1),
    ('AST1002',  1), ('PHY1020',  1),
    ('MAC1105',  1), ('STA2023',  2),
    ('ECO2013',  1), ('CGS1060C', 1),
    ('CGS1540C', 1), ('COP1334',  2),
    ('CTS1134',  1),
    ('CGS3763',  3), ('CIS3360',  2), ('CIS3510',  1),
    ('CIS4347',  2), ('CNT3409C', 3), ('CNT3526C', 2),
    ('CNT4603',  2), ('CNT4702',  3), ('CTS4955',  1)
) AS lv(cc, lv) ON req.course_code = lv.cc;


-- ══════════════════════════════════════════════════════════════════════════════
-- PROGRAM 6: IST – Software Engineering Concentration (BS-ISTS) — 120 credits
-- Fixed requirements: 27 courses
-- ══════════════════════════════════════════════════════════════════════════════
WITH m AS (
    INSERT INTO public.degree_models
        (degree_code, total_credits_required, is_published, version_number, created_by, effective_term)
    VALUES ('BS-ISTS', 120, false, 1, NULL, '2257')
    RETURNING model_id
),
req AS (
    INSERT INTO public.degree_requirements (model_id, course_code, priority_value, is_wildcard)
    SELECT m.model_id, c.cc, c.pv, false
    FROM m,
    (VALUES
        -- Gen Ed: Communications
        ('ENC1101',  1),  ('ENC1102',  2),  ('SPC1017',  1),
        -- Gen Ed: Humanities  ⚠ GEN ED CHOICE
        ('ARH1000',  1),  ('DAN2100',  1),
        -- Gen Ed: Social Sciences  ⚠ GEN ED CHOICE
        ('POS2041',  1),  ('PSY2012',  1),
        -- Gen Ed: Natural Sciences  ⚠ GEN ED CHOICE
        ('AST1002',  1),  ('PHY1020',  1),
        -- Gen Ed: Mathematics  ⚠ GEN ED CHOICE
        ('MAC1105',  1),  ('STA2023',  2),
        -- Gen Ed: Elective  ⚠ GEN ED CHOICE
        ('ECO2013',  1),
        -- Computer Competency (also Lower Div Group A prereq)
        ('CGS1060C', 1),
        -- Lower Division Group A
        ('CGS1540C', 1),  ('COP1334',  2),  ('COP2800',  3),
        -- Lower Division Group B  ⚠ alt: CTS1650
        ('CTS1134',  1),
        -- Lower Division Group C  ⚠ alt: MAD2104
        ('MAD1100',  2),
        -- Upper Division Professional Core
        ('CGS3763',  3),  ('CIS3360',  2),  ('CIS3510',  1),
        -- Upper Division Discipline Content
        ('CET3126C', 1),  ('CET3383C', 4),  ('CEN4025C', 5),
        ('CEN4090C', 1),  ('COP3530',  4),  ('COT4400',  4)
    ) AS c(cc, pv)
    RETURNING requirement_id, course_code
)
INSERT INTO public.requirement_levels (requirement_id, level_value)
SELECT req.requirement_id, lv.lv
FROM req
JOIN (VALUES
    ('ENC1101',  1), ('ENC1102',  2), ('SPC1017',  1),
    ('ARH1000',  1), ('DAN2100',  1),
    ('POS2041',  1), ('PSY2012',  1),
    ('AST1002',  1), ('PHY1020',  1),
    ('MAC1105',  1), ('STA2023',  2),
    ('ECO2013',  1), ('CGS1060C', 1),
    ('CGS1540C', 1), ('COP1334',  2), ('COP2800',  3),
    ('CTS1134',  1), ('MAD1100',  2),
    ('CGS3763',  3), ('CIS3360',  2), ('CIS3510',  1),
    ('CET3126C', 1), ('CET3383C', 4), ('CEN4025C', 5),
    ('CEN4090C', 1), ('COP3530',  4), ('COT4400',  4)
) AS lv(cc, lv) ON req.course_code = lv.cc;


COMMIT;

-- =============================================================================
-- POST-IMPORT CHECKLIST
-- =============================================================================
-- 1. Link degree_programs.dept_id once the EnTec department row exists:
--      UPDATE public.degree_programs
--      SET dept_id = (SELECT dept_id FROM departments WHERE dept_name = 'School of Engineering, Technology, and Design')
--      WHERE degree_code IN ('BS-AAI','BS-DA','BS-CYB','BS-ECET','BS-ISTN','BS-ISTS');
--
-- 2. Set degree_models.created_by once admin user exists:
--      UPDATE public.degree_models SET created_by = '<admin-uuid>'
--      WHERE degree_code IN ('BS-AAI','BS-DA','BS-CYB','BS-ECET','BS-ISTN','BS-ISTS');
--
-- 3. Flip is_published when ready to expose programs to students:
--      UPDATE public.degree_models SET is_published = true
--      WHERE degree_code IN ('BS-AAI','BS-DA','BS-CYB','BS-ECET','BS-ISTN','BS-ISTS');
--
-- 4. Gen Ed choice substitutions — search for ⚠ GEN ED CHOICE in this file.
--    Each tag marks a course that was picked as a representative from a
--    catalog selection list. Update the course_code in both the INSERT VALUES
--    and the level JOIN VALUES to the student's (or institution's) preferred
--    course for that slot.
--
-- 5. Elective budget: programs list 12–24 credits of open electives in the
--    catalog. These are NOT rows in degree_requirements. The plan algorithm
--    should compute remaining_credits = total_credits_required − sum of
--    credits for all fixed requirement rows, and treat the difference as
--    free/elective slots to fill during schedule generation.
--
-- 6. CIS3360 in ISTN/ISTS uses prereq CTS1134 OR CTS1650. The courses table
--    stores 'CTS1134,CTS1650' as prerequisite_codes. Your algorithm should
--    treat comma-separated codes as OR when both appear as prereqs for a
--    single course and neither is already in the degree_requirements list
--    (CTS1650 is not a fixed requirement for ISTN/ISTS — only CTS1134 is).
--
-- 7. CAP4631C prereq stored as 'COP1047C,STA3164'. In the Data Analytics
--    program CAP3330 is seeded as the stats course (alt to STA3164).
--    If a student takes CAP3330 instead of STA3164, your algorithm should
--    treat either as satisfying the prereq. You may want a prereq_alternatives
--    column or a separate table for OR-prerequisite groups.
-- =============================================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — BS-AAI PROGRAM MODEL (priority-ordered sequence guide)
--
-- Hand-authored 9-semester sequence sourced from
-- "Computer Science (AA) to Applied Artificial Intelligence (BS) sequence.sql".
-- Replaces what server/seed.js's seedProgramModelFor would otherwise build
-- from degree_requirements/requirement_levels for BS-AAI. seed.js detects
-- non-empty program_model_row entries and skips its rebuild for this program.
--
-- Code normalization applied:
--   • spaces stripped from all course codes (matches existing seed style)
--   • new file's "CAI 2100C" (Intro to AI) → CAI1001C (existing AI Thinking)
--   • new file's "CAI 2300C" (ML Foundations) → CAI2100C (existing ML Foundations)
--
-- Two new courses added to courses catalog (CAP4770 and CEN4010 are 3-credit
-- variants distinct from the existing CAP4767 / CET3383C / CEN4025C entries).
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.courses (course_code, title, credits, prerequisite_codes, corequisite_codes)
VALUES
    ('SLS1106', 'First Year Experience Seminar',  1, NULL, NULL),
    ('CAP4770', 'Data Mining',                    3, NULL, NULL),
    ('CEN4010', 'Software Engineering',           3, NULL, NULL)
ON CONFLICT (course_code) DO NOTHING;


-- Reset BS-AAI's program_model so re-applying this file produces a clean
-- state. Order matters because student_profiles.selected_program_model_id has
-- a NO-ACTION FK at the row, NOT a CASCADE, and the partial unique index
-- idx_program_model_active forbids two active rows for the same program_id:
--   1) Deactivate every existing BS-AAI program_model (frees the active slot).
--   2) Upsert the curated row with is_active = FALSE (also free).
--   3) Repoint any student profile on BS-AAI to the curated row.
--   4) Delete the now-orphan, deactivated BS-AAI program_models.
--   5) Activate the curated row.
--   6) Wipe + re-insert program_model_row entries for the curated row.

UPDATE public.program_model SET is_active = FALSE WHERE program_id = 'BS-AAI';

INSERT INTO public.program_model
    (id, program_id, version, effective_term, is_active, total_credits_required)
VALUES
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 'BS-AAI', 1, '2257', FALSE, 120)
ON CONFLICT (id) DO UPDATE
    SET program_id              = EXCLUDED.program_id,
        is_active               = FALSE,
        total_credits_required  = EXCLUDED.total_credits_required;

UPDATE public.student_profiles
   SET selected_program_model_id = 'a1b2c3d4-e5f6-7890-1234-56789abcdef0'
 WHERE degree_code = 'BS-AAI';

DELETE FROM public.program_model
 WHERE program_id = 'BS-AAI'
   AND id <> 'a1b2c3d4-e5f6-7890-1234-56789abcdef0';

DELETE FROM public.program_model_row
 WHERE program_model_id = 'a1b2c3d4-e5f6-7890-1234-56789abcdef0';


INSERT INTO public.program_model_row
    (program_model_id, priority, course_id, category, level, is_elective,
     default_course_id, allowed_course_ids, term_length, offered_in_summer)
VALUES
    -- ── Semester 1 (Fall) ───────────────────────────────────────────────────
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0',  10, 'ENC1101',  'GEN_ED_COMM',     1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0',  20, 'MAC1105',  'GEN_ED_MATH',     1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0',  30, 'SLS1106',  'GEN_ED_ELECTIVE', 1, FALSE, NULL, NULL, 'FIRST_8_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0',  40, 'CAI1001C', 'MAJOR',           1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0',  50, 'COP1047C', 'MAJOR',           1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    -- ── Semester 2 (Spring) ─────────────────────────────────────────────────
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0',  60, 'MAC1147',  'MAJOR_PREP',      1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0',  70, 'ENC1102',  'GEN_ED_COMM',     1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0',  80, 'COP1334',  'MAJOR',           1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0',  90, 'STA2023',  'MAJOR_PREP',      1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    -- ── Semester 3 (Summer) ─────────────────────────────────────────────────
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 100, 'CAI2100C', 'MAJOR',           1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 110, 'COP2800',  'MAJOR',           1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    -- ── Semester 4 (Fall) ───────────────────────────────────────────────────
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 120, 'MAC2311',  'MAJOR_PREP',       1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 130, 'PHY1025',  'GEN_ED_SCIENCE',   1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 140, 'CAI3821C', 'MAJOR',            2, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 150, 'CAI2840C', 'MAJOR',            1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    -- ── Semester 5 (Spring) ─────────────────────────────────────────────────
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 160, 'MAC2312',  'MAJOR_PREP',       1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 170, 'CAI3822C', 'MAJOR',            2, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 180, 'COP3530',  'MAJOR',            2, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 190, 'CAI3303C', 'MAJOR',            2, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    -- ── Semester 6 (Summer) ─────────────────────────────────────────────────
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 200, 'PHY2048',  'GEN_ED_SCIENCE',     1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 210, 'PHY2048L', 'GEN_ED_SCIENCE_LAB', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 220, 'PHI2680',  'GEN_ED_HUMANITIES',  1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    -- ── Semester 7 (Fall) ───────────────────────────────────────────────────
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 230, 'CHM1045',  'GEN_ED_SCIENCE',     1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 240, 'CHM1045L', 'GEN_ED_SCIENCE_LAB', 1, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 250, 'CAI4505C', 'MAJOR',              2, FALSE, NULL, NULL, 'FULL_16_WEEK', FALSE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 260, 'CAI4510C', 'MAJOR',              2, FALSE, NULL, NULL, 'FULL_16_WEEK', FALSE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 270, 'CAI4830C', 'MAJOR',              2, FALSE, NULL, NULL, 'FULL_16_WEEK', FALSE),
    -- ── Semester 8 (Spring) ─────────────────────────────────────────────────
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 280, 'CAI4420C', 'MAJOR',                2, FALSE, NULL, NULL, 'FULL_16_WEEK', FALSE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 290, 'CAI4525C', 'MAJOR',                2, FALSE, NULL, NULL, 'FULL_16_WEEK', FALSE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 300, NULL,       'PROGRAM_ELECTIVE',     2, TRUE,  'CAP3330', ARRAY['CAP3330','STA3164'],  'FULL_16_WEEK', TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 310, NULL,       'GEN_ED_SOCIAL_SCIENCE',1, TRUE,  'AMH2010', ARRAY['AMH2010','POS2041'],  'FULL_16_WEEK', TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 320, NULL,       'GEN_ED_HUMANITIES',    1, TRUE,  'ARH1000', ARRAY['ARH1000','HUM1020'],  'FULL_16_WEEK', TRUE),
    -- ── Semester 9 (Fall) ───────────────────────────────────────────────────
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 330, 'CAI4950C', 'CAPSTONE',             2, FALSE, NULL,      NULL,                        'FULL_16_WEEK', FALSE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 340, NULL,       'GEN_ED_ORAL_COMM',     1, TRUE,  'SPC1017', ARRAY['SPC1017','ENC2300'],  'FULL_16_WEEK', TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 350, NULL,       'GEN_ED_SOCIAL_SCIENCE',1, TRUE,  'ECO2013', ARRAY['ECO2013','PSY2012'],  'FULL_16_WEEK', TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 360, NULL,       'GEN_ED_HUMANITIES',    1, TRUE,  'LIT2000', ARRAY['LIT2000','MUL1010'],  'FULL_16_WEEK', TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 370, NULL,       'PROGRAM_ELECTIVE',     2, TRUE,  'CAP4770', ARRAY['CAP4770','CEN4010'],  'FULL_16_WEEK', TRUE),
    ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 380, NULL,       'PROGRAM_ELECTIVE',     2, TRUE,  'CEN4010', ARRAY['CEN4010','CAP4770'],  'FULL_16_WEEK', TRUE)
ON CONFLICT (program_model_id, priority) DO NOTHING;


-- Now that the curated row is fully populated, flip it active. Earlier rows
-- for BS-AAI were deactivated above (or deleted), so the partial unique
-- index idx_program_model_active is satisfied by this single TRUE row.
UPDATE public.program_model
   SET is_active = TRUE
 WHERE id = 'a1b2c3d4-e5f6-7890-1234-56789abcdef0';


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — BS-ISTS PROGRAM MODEL (priority-ordered sequence guide)
--
-- Hand-authored 33-row sequence sourced from
-- "Information Systems Technology – Software Engineering (BS-IST).sql".
-- Replaces what server/seed.js's seedProgramModelFor would otherwise build
-- from degree_requirements/requirement_levels for BS-ISTS.
--
-- Code normalization applied:
--   • spaces stripped from all course codes (matches existing seed style)
--
-- Elective handling (per user direction):
--   The original BS-IST file pinned Group A and Group B electives to specific
--   real courses (CEN4010, CAP4770, CIS4327, CEN4341, CAP4773). To avoid
--   credit-count collisions with the BS-AAI integration (which uses 3-credit
--   CAP4770/CEN4010), Group A and Group B slots resolve to PLACEHOLDER
--   courses worth 4 credits each. Students/advisors pick the real course
--   outside the app, or via faculty-edited allowed_course_ids later.
-- ══════════════════════════════════════════════════════════════════════════════

-- Two real courses that aren't yet in the catalog (used as required rows).
INSERT INTO public.courses (course_code, title, credits, prerequisite_codes, corequisite_codes)
VALUES
    ('COT3100',  'Discrete Structures',                4, NULL, NULL),
    ('CEN4065C', 'Software Architecture and Design',   4, NULL, NULL)
ON CONFLICT (course_code) DO NOTHING;

-- Two placeholder courses for the prefix-based Group A and Group B electives.
-- Title carries the prefix list so a human reading the plan UI sees what
-- real course this slot is meant to be filled with.
INSERT INTO public.courses (course_code, title, credits, prerequisite_codes, corequisite_codes)
VALUES
    ('GROUP_A_ELEC_4CR',
     'Program Elective Group A (4 cr) - pick any course with prefix CAI/CAP/CEN/CET/CGS/CIS/CNT/COP/CTS',
     4, NULL, NULL),
    ('GROUP_B_ELEC_4CR',
     'Program Elective Group B (4 cr) - pick a 2/3/4-level course with prefix CAI/CAP/CEN/CET/CGS/CIS/CNT/COP/CTS',
     4, NULL, NULL)
ON CONFLICT (course_code) DO NOTHING;


-- Reset BS-ISTS's program_model. Order matters (see Section 5 BS-AAI block
-- for the full explanation): deactivate -> upsert curated row inactive ->
-- repoint students -> delete others -> wipe rows -> insert -> activate.

UPDATE public.program_model SET is_active = FALSE WHERE program_id = 'BS-ISTS';

INSERT INTO public.program_model
    (id, program_id, version, effective_term, is_active, total_credits_required)
VALUES
    -- 123 = original 120 + 3 cr for PHY1025 added at priority 175 to satisfy
    -- PHY2048 / PHY2048L's prereq. CET2123C / ETI4480C still have ECET-track
    -- prereqs that aren't in this sequence (CET1110C, COP2270, CET3126C);
    -- those are flagged at generation time via PREREQ_OUT_OF_PROGRAM notes
    -- for faculty review rather than bloating the program.
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 'BS-ISTS', 1, '2257', FALSE, 123)
ON CONFLICT (id) DO UPDATE
    SET program_id              = EXCLUDED.program_id,
        is_active               = FALSE,
        total_credits_required  = EXCLUDED.total_credits_required;

UPDATE public.student_profiles
   SET selected_program_model_id = 'b2c3d4e5-f6a7-8901-2345-6789abcdef01'
 WHERE degree_code = 'BS-ISTS';

DELETE FROM public.program_model
 WHERE program_id = 'BS-ISTS'
   AND id <> 'b2c3d4e5-f6a7-8901-2345-6789abcdef01';

DELETE FROM public.program_model_row
 WHERE program_model_id = 'b2c3d4e5-f6a7-8901-2345-6789abcdef01';


INSERT INTO public.program_model_row
    (program_model_id, priority, course_id, category, level, is_elective,
     default_course_id, allowed_course_ids, term_length, offered_in_summer)
VALUES
    -- ── Level 1: Foundations & Prerequisites ────────────────────────────────
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01',  10, 'ENC1101',  'GEN_ED_COMM',     1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01',  20, 'MAC1105',  'GEN_ED_MATH',     1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01',  30, 'SLS1106',  'GEN_ED_ELECTIVE', 1, FALSE, NULL, NULL, 'FIRST_8_WEEK',  TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01',  40, 'CGS1060C', 'LOWER_DIV_TECH',  1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01',  50, 'CTS1134',  'LOWER_DIV_TECH',  1, FALSE, NULL, NULL, 'FULL_16_WEEK',  TRUE),

    -- ── Level 2: Intro Programming & Intermediate Math ─────────────────────
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01',  60, 'ENC1102',  'GEN_ED_COMM',      2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01',  70, 'MAC1147',  'MAJOR_PREP',       2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01',  80, 'COP1334',  'LOWER_DIV_TECH',   2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01',  90, 'SPC1017',  'GEN_ED_ORAL_COMM', 2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 100, 'STA2023',  'GEN_ED_MATH',      2, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

    -- ── Level 3: Core CS Transitions ───────────────────────────────────────
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 110, 'MAC2311',  'MAJOR_PREP',      3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 120, 'COP2800',  'LOWER_DIV_TECH',  3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 130, 'CET2123C', 'LOWER_DIV_TECH',  3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 140, 'CIS3360',  'MAJOR',           3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 150, 'COT3100',  'MAJOR',           3, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

    -- ── Level 4: Data Structures & State Gen Eds ───────────────────────────
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 160, 'COP3530',  'MAJOR',              4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 170, 'CGS3763',  'MAJOR',              4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    -- PHY1025 inserted before PHY2048 / PHY2048L; without it the courses table
    -- prereq 'PHY1025,MAC2311' on those rows is filtered to just MAC2311 by
    -- prereqFilter, leaving a PREREQ_OUT_OF_PROGRAM note. Adding it as a
    -- required row at priority 175 satisfies the prereq cleanly.
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 175, 'PHY1025',  'GEN_ED_SCIENCE',     4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 180, 'PHY2048',  'GEN_ED_SCIENCE',     4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 190, 'PHY2048L', 'GEN_ED_SCIENCE_LAB', 4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 200, 'ARH1000',  'GEN_ED_HUMANITIES',  4, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

    -- ── Level 5: Architecture, Robotics & MDC Gen Eds ──────────────────────
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 210, 'CEN4065C', 'MAJOR',                 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 220, 'ETI4480C', 'MAJOR',                 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 230, 'PHY2049',  'GEN_ED_SCIENCE',        5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 240, 'PHY2049L', 'GEN_ED_SCIENCE_LAB',    5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 250, 'POS2041',  'GEN_ED_SOCIAL_SCIENCE', 5, FALSE, NULL, NULL, 'FULL_16_WEEK', TRUE),

    -- ── Level 6/7: Capstone & Program Electives ────────────────────────────
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 260, 'LIT2000',  'GEN_ED_HUMANITIES',     6, FALSE, NULL,                NULL,                       'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 270, 'ECO2013',  'GEN_ED_SOCIAL_SCIENCE', 6, FALSE, NULL,                NULL,                       'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 280, 'CEN4090C', 'CAPSTONE',              7, FALSE, NULL,                NULL,                       'FULL_16_WEEK', FALSE),

    -- Group A: 8 credits across 2 placeholder slots (CAI/CAP/CEN/CET/CGS/CIS/CNT/COP/CTS prefixes)
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 290, NULL,       'PROGRAM_ELECTIVE_A',    6, TRUE,  'GROUP_A_ELEC_4CR',  ARRAY['GROUP_A_ELEC_4CR'],  'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 300, NULL,       'PROGRAM_ELECTIVE_A',    6, TRUE,  'GROUP_A_ELEC_4CR',  ARRAY['GROUP_A_ELEC_4CR'],  'FULL_16_WEEK', TRUE),

    -- Group B: 12 credits across 3 placeholder slots (level 2-4 of same prefixes)
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 310, NULL,       'PROGRAM_ELECTIVE_B',    6, TRUE,  'GROUP_B_ELEC_4CR',  ARRAY['GROUP_B_ELEC_4CR'],  'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 320, NULL,       'PROGRAM_ELECTIVE_B',    6, TRUE,  'GROUP_B_ELEC_4CR',  ARRAY['GROUP_B_ELEC_4CR'],  'FULL_16_WEEK', TRUE),
    ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 330, NULL,       'PROGRAM_ELECTIVE_B',    6, TRUE,  'GROUP_B_ELEC_4CR',  ARRAY['GROUP_B_ELEC_4CR'],  'FULL_16_WEEK', TRUE)
ON CONFLICT (program_model_id, priority) DO NOTHING;

UPDATE public.program_model
   SET is_active = TRUE
 WHERE id = 'b2c3d4e5-f6a7-8901-2345-6789abcdef01';


-- =============================================================================
-- END OF FILE
-- =============================================================================
