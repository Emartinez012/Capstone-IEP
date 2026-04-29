# Capstone-IEP

> Individualized Education Plan (IEP) Course Planner — built as a senior capstone project for Miami-Dade College's School of Engineering & Technology.

A full-stack web app that takes a student's degree, transfer credits, and personal preferences and spits out a semester-by-semester course plan all the way to graduation. Three roles are supported: **Student**, **Advisor**, and **Faculty/Chairperson**.

---

## What it does

- **Students** sign up, walk through a 6–7 step onboarding wizard (degree program, target credits, preferred modality, time blocks, campus, starting term, and — for transfers — completed coursework), and get an auto-generated plan.
- **Advisors** can browse their roster of students and (re)generate plans on their behalf.
- **Chairpersons** can create and manage degree programs.
- The planner respects prerequisites, corequisites (lecture/lab pairs), credit-load preferences, and summer opt-out.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite, vanilla CSS, no global state library |
| Backend | Node.js + Express (port 3001) |
| Database | PostgreSQL 15 via `pg` |
| Auth | Email + password, hashed with `bcryptjs` |
| Container | Docker / docker-compose |

## How the algorithm works

The core logic lives in `server/algorithm/planAlgorithm.js`. Given a student's completed courses and their degree's course model, it:

1. Marks already-completed/transferred courses as done.
2. Sorts remaining required courses by `priority_index` (lower = earlier).
3. Walks the list with a hybrid strict-priority strategy — when the next course is blocked by an unmet prerequisite, the algorithm allows that prerequisite chain to be placed first so the blocked course can land the following semester.
4. Treats corequisites (e.g., a lecture and its lab) as one — they're placed together or deferred together.
5. Fills any leftover semester capacity with `Student Elective` placeholders.
6. Advances semesters using the `YYT` term code format (e.g., `261` = Fall 2026, `262` = Spring 2027, `263` = Summer 2027), skipping summers when the student opts out.

## Running it locally

You'll need two terminals plus a Postgres container named `iep_engine_db` on a Docker network called `iep-internal`.

```bash
# Terminal 1 — backend
cd server && node server.js

# Terminal 2 — frontend
cd client && npm run dev
```

Then open <http://localhost:5173>. Vite proxies all `/api` requests to the backend on `:3001`.

### Docker (one shot)

```bash
docker-compose up
```

### Seeding the database

Order matters here:

```bash
# 1. Course catalog + degree models (171 courses across 6 programs)
docker exec -i <container_name> psql -U admin -d iep_engine < entec_bs_seed_v2.sql

# 2. Test users
cd server && node seed.js
```

### Test accounts

| Role | Email | Password |
|---|---|---|
| Student | `student1@mdc.edu` | `password123` |
| Advisor | `advisor1@mdc.edu` | `password123` |
| Chairperson | `chair1@mdc.edu` | `password123` |

## Project layout

```
client/                   React + Vite frontend
  src/
    App.jsx               Top-level view router (state-string based)
    api.js                Single point of entry for backend calls
    components/           StudentOnboarding, PlanDisplay, SemesterCard, ...
server/
  server.js               Express entry; runs migrate() before listen()
  db.js                   pg pool
  algorithm/
    planAlgorithm.js      The core scheduling logic
  routes/                 auth, students, plans, courses, majors
  migrations/             schema_updates.sql + idempotent migrate()
  tests/                  algorithm.test.js
entec_bs_seed_v2.sql      Course/degree-model seed data
docker-compose.yml
```

## Seeded degree tracks

| Code | Program | Credits |
|---|---|---|
| BS-ISTS | IST — Software Engineering | 120 |
| BS-AAI  | Applied Artificial Intelligence | 120 |
| BS-DA   | Data Analytics | 120 |
| BS-CYB  | Cybersecurity | 120 |
| BS-ECET | Electrical & Computer Engineering Technology | 134 |
| BS-ISTN | IST — Networking | 120 |

## Tests

```bash
cd server && node tests/algorithm.test.js
cd client && npm run lint
cd client && npm run build
```

## What we'd still like to build

- **Section matching** — the schema reserves `course_sections`, `assigned_modality`, and `section_id` so a future pass can pin specific class sections to the plan based on the student's modality / time / campus preferences. Right now those preferences are stored but not consumed by the algorithm.
- **OR-logic prerequisites** — `prerequisite_codes` is currently evaluated as an AND-list.
- **IEP workflow** — `iep_status_history` and `iep_snapshots` tables exist for tracking plan status (Temporary / Official / Archived / Submitted) over time.
## Team / acknowledgements

Built as a capstone project at Miami-Dade College. Thanks to Professor Gabb for the deep dive meetings, helping us navigate the nuances of our project.
