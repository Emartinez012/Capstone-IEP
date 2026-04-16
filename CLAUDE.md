# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Application

Requires two terminals:

```bash
# Terminal 1 — Backend (port 3001)
cd server && node server.js

# Terminal 2 — Frontend (port 5173)
cd client && npm run dev
```

Visit http://localhost:5173. The Vite dev server proxies all `/api` requests to `http://localhost:3001`.

**Docker alternative:** `docker-compose up` (spins up backend + frontend; PostgreSQL must already be running as container `iep_engine_db` on network `iep-internal`).

**Apply schema changes to container:**
```bash
docker exec -i <container_name> psql -U admin -d iep_engine < server/migrations/schema_updates.sql
```

**Reseed database:** `cd server && node seed.js` — resets and repopulates all tables with test data and both degree tracks (S9501, S9520).

**Test accounts:**
- Student: `student1@mdc.edu` / `password123` (S9501, profile complete — goes to dashboard)
- Advisor: `advisor1@mdc.edu` / `password123`

## Other Commands

```bash
cd client && npm run build   # Production build
cd client && npm run lint    # ESLint
cd server && node tests/algorithm.test.js  # Algorithm unit tests
```

## Architecture

**IEP (Individualized Education Plan) Course Planner** for Miami-Dade College. Three roles: Student, Advisor, Faculty.

### Stack
- **Frontend:** React 19 + Vite, component-state only (no Redux/Context), vanilla CSS
- **Backend:** Node.js + Express on port 3001
- **Database:** PostgreSQL 15 (container `iep_engine_db`); `pg` pool in `server/db.js`
- **Auth:** Email/password — `bcryptjs` hash on signup and `bcrypt.compare` on login (both implemented correctly in `auth.js`)

### Request Flow

```
Browser → Vite proxy /api → Express routes → PostgreSQL
```

All frontend API calls go through `client/src/api.js`. The backend mounts five routers in `server/server.js`:

| Prefix | File | Key endpoints |
|---|---|---|
| `/api/auth` | `routes/auth.js` | POST `/signup`, POST `/login` |
| `/api/students` | `routes/students.js` | GET `/`, GET `/:id`, PUT `/:id` |
| `/api/plans` | `routes/plans.js` | POST `/generate/:studentId`, GET `/:studentId` |
| `/api/courses` | `routes/courses.js` | GET `/` |
| `/api/majors` | `routes/majors.js` | GET `/`, GET `/:id/model` |

### Server Startup (`server/server.js`)

On start, `migrate()` runs before `app.listen()`. It applies all `ALTER TABLE` and `CREATE INDEX IF NOT EXISTS` statements so the live container stays in sync without wiping data. The full SQL equivalent is in `server/migrations/schema_updates.sql`.

### Student Onboarding Flow

New students go: signup → 6-step wizard (`StudentOnboarding.jsx`) → plan generation → dashboard.
Transfer students get a 7th step (course checklist). The wizard collects:

| Step | Field(s) |
|---|---|
| type | `is_transfer` |
| program | `degree_code` |
| load | `target_credits` (default 12), `preferred_term_durations`, `opt_out_summer` |
| modality | `preferred_modality` (multi-select: In-Person / Online / Blended) |
| schedule | `preferred_campus_location`, `preferred_time_slot.blocks`, `preferred_time_slot.pattern` |
| term | `starting_term` |
| courses (transfer only) | `completed_courses` |

All preferences are saved via `PUT /api/students/:id`, then `POST /api/plans/generate/:id` runs the algorithm immediately.

### Plan Generation Algorithm (`server/algorithm/planAlgorithm.js`)

Entry point: `createPlan(student, history, model)`.

1. Builds a set of completed courses from `history`
2. Filters remaining required courses from `model`
3. Iteratively assigns courses to semesters by checking prerequisite satisfaction (`checkPrerequisites`)
4. Packs courses up to `target_credits` per semester (default 12)
5. Advances term codes via `advanceTerm`, respecting `opt_out_summer`

**Term code format:** `YYT` — e.g., `261` = Fall 2026, `262` = Spring 2027, `263` = Summer 2027.

Currently uses: `starting_term`, `target_credits`, `opt_out_summer`.
Stored but not yet used by algorithm: `preferred_modality`, `preferred_campus_location`, `preferred_time_slot`, `preferred_term_durations` — reserved for future section-matching against `course_sections`.

### Frontend View State

`App.jsx` controls the top-level view via a `view` state string. If view is `student-onboarding` but `user` is null (e.g., after hot-reload), it redirects to `student-auth` automatically.

| Value | Component |
|---|---|
| `landing` | `LandingPage.jsx` — role selection |
| `student-auth` | `StudentAuth.jsx` — login/signup |
| `student-onboarding` | `StudentOnboarding.jsx` — 6/7-step wizard |
| `student-dashboard` | `StudentDashboard.jsx` — plan display |
| `advisor` | `AdvisorView.jsx` — student list + plan generation |

Plan output is rendered by `PlanDisplay.jsx` → `SemesterCard.jsx`.

### Database Schema (Key Tables)

- **users** — `user_id` (UUID), `email` (unique), `password_hash`, `role` (enum: Student/Advisor/Admin/Faculty)
- **student_profiles** — `user_id` (FK), `degree_code`, `current_degree_model_id`, `target_credits`, `starting_term`*, `opt_out_summer`, `is_transfer`*, `preferred_modality` (JSONB), `preferred_campus_location`, `preferred_time_slot` (JSONB), `preferred_term_durations` (JSONB)
- **academic_history** — `user_id`, `course_code`, `grade` (transfer rows use grade `'TR'`)
- **generated_schedules** — `schedule_id`, `student_user_id`, `projected_graduation_term`, `status` (enum: Temporary/Official/Archived/Submitted)
- **schedule_items** — `schedule_id`, `course_code`, `semester_year` (integer sequence 1,2,3…), `semester_term` (term code e.g. `261`)
- **degree_models** / **degree_requirements** / **requirement_levels** — define the course model used by the algorithm
- **courses** — `course_code` (PK), `title`, `credits`, `prerequisite_codes` (text, evaluated as boolean expression by algorithm)

*`starting_term` and `is_transfer` are not in the original schema DDL — they are added at startup by `migrate()` and are documented in `server/migrations/schema_updates.sql`.

### Columns Reserved for Future Features

| Column(s) | Table | Planned Feature |
|---|---|---|
| `academic_standing`, `expected_graduation_date`, `is_currently_enrolled`, `assigned_advisor_id` | `student_profiles` | Advisor dashboard — student status tracking |
| `assigned_modality`, `section_id` | `schedule_items` | Section-matching phase of the plan algorithm |
| `term_taken`, `credits_earned` | `academic_history` | Transfer credit detail view |
| `audit_logs` (entire table) | — | Admin audit trail |
| `course_sections` (entire table) | — | Section scheduling with modality/time/campus data |
| `iep_status_history`, `iep_snapshots` | — | IEP workflow status tracking and snapshots |

### Seeded Degree Tracks

| Code | Program | Courses |
|---|---|---|
| S9501 | B.S. Information Systems Tech — Software Engineering | ENC1101, MAC1105, CGS1060C, CTS1134, CIS3510, CGS1540C, COP1334, CGS3763, COP2800 |
| S9520 | B.S. Applied Artificial Intelligence | ENC1101, MAC1105, CAI1001C, COP1047C, PHI2680, STA2023, CAI2100C, COP2800, CAI2840C, CAI2300C, CAI3821C, CAI3303C, COP3530, CAI4505C |

### Known Gaps

- `STA2023` prereq references `MAT1033 OR MGF1131` (not seeded) — algorithm skips it with a warning
- `CAI4505C` prereq references `CAI3822C` (not seeded) — algorithm skips it with a warning
- `course_sections` table is empty — section-matching not yet implemented
