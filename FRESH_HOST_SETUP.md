# Fresh-Host Setup — Expert Advisor / IEP Engine

End-to-end guide for bringing the project up on a brand-new computer. Goes from a blank workstation → fully seeded, running app at `http://localhost:5173`.

---

## What gets installed

Four Docker containers on the `iep-internal` network:

| Container | Image | Port | Purpose |
|---|---|---|---|
| `iep_engine_db` | `postgres:15-alpine` | 5432 | PostgreSQL — single source of truth |
| `backend-service` | built from `./server` | 3001 | Express API |
| `frontend-service` | built from `./client` | 5173 | Vite dev server |
| `cloudflared-tunnel` | `cloudflare/cloudflared:latest` | — | Public access via Cloudflare Tunnel (optional) |

Persistent data lives in the `pgdata` Docker volume — survives container restarts but gets nuked by `docker-compose down -v`.

---

## Prerequisites

1. **Docker Desktop** — https://www.docker.com/products/docker-desktop/  
   After install: open Docker Desktop, wait for the whale icon to go solid → "Docker is running".
2. **Git** — https://git-scm.com/downloads
3. (Optional) A `psql` client if you want to inspect the DB from the host. Not required — every example below uses `docker exec`.

Windows note: all commands below run from PowerShell or Git Bash. Paths use forward slashes.

---

## First-time setup (do this once)

### 1. Clone the repo

```bash
git clone https://github.com/your-org/Capstone-IEP.git
cd Capstone-IEP
```

### 2. Build images and start all containers

```bash
docker-compose up -d --build
```

`-d` = detached (runs in background). `--build` = rebuild images from current source. First run is ~3–5 min while Postgres + node deps download.

Watch progress:

```bash
docker-compose logs -f
```

Press `Ctrl+C` to stop following logs (containers keep running). Wait until you see `backend-service` print `Migrations applied.` and `Expert Advisor server running on http://localhost:3001` — that means the backend has finished applying schema migrations.

### 3. Apply the curriculum seed (SQL file)

The course catalog and degree models come from `entec_bs_seed_v2.sql`. Apply it once:

```bash
docker exec -i iep_engine_db psql -U admin -d iep_engine < entec_bs_seed_v2.sql
```

Expected: a flurry of `INSERT 0 N` lines, no `ERROR`. This loads ~190 courses, 8 degree programs, and the curated BS-AAI sequence.

### 4. Seed test users + program models

```bash
docker exec backend-service node seed.js
```

Expected output:

```
Starting seed...
Clearing user and plan data...
Seeding program models...
  BS-AAI: program_model already populated (curated sequence) — skipping rebuild
  BS-CYB: 26 required rows (no curated elective)
  BS-DA: 26 required rows (no curated elective)
  BS-ECET: 37 required rows (no curated elective)
  BS-ISTN: 25 required rows (no curated elective)
  BS-ISTS: 27 required rows + 1 elective slot
  S9501: 9 required rows (no curated elective)
  S9520: 14 required rows (no curated elective)
Creating test users...
Seeding completed successfully!
  student1@mdc.edu / password123  (BS-ISTS — Software Engineering, Kendall)
  ...
```

### 5. Open the app

http://localhost:5173

### 6. Log in with a test account

| Role | Email | Password |
|---|---|---|
| Student | `student1@mdc.edu` | `password123` |
| Advisor | `advisor1@mdc.edu` | `password123` |
| Faculty Chair | `chair1@mdc.edu` | `password123` |

Or click **Student → Create Account** to make a brand-new account and walk through onboarding.

---

## Daily restart (computer rebooted, or you closed Docker Desktop)

Just bring the stack back up:

```bash
docker-compose up -d
```

No rebuild needed; data in the `pgdata` volume is preserved. Open http://localhost:5173 and log in.

If you only want to restart one service after a code change:

```bash
docker-compose restart backend
docker-compose restart frontend
```

For backend changes that touch source files, rebuild that service:

```bash
docker-compose up -d --build backend
```

---

## Reseed (start over without losing the schema)

Use this when test data gets messy and you want fresh students/plans but keep the curriculum.

```bash
docker exec backend-service node seed.js
```

This wipes user/plan tables (`users`, `student_profiles`, `schedule_items`, etc.) and recreates the test accounts. The curated `program_model` for BS-AAI is preserved; other programs' `program_model` rows get rebuilt from `degree_requirements`.

---

## Full nuke (start over completely — including the database)

Use this only if the database is corrupted or you want to test the fresh-host path again. **You will lose all student data.**

```bash
# 1. Stop everything and delete the postgres volume
docker-compose down -v

# 2. Bring it back up empty
docker-compose up -d --build

# 3. Wait for backend to finish migrations (watch logs until you see "Expert Advisor server running")
docker-compose logs -f backend

# 4. Re-apply the SQL seed
docker exec -i iep_engine_db psql -U admin -d iep_engine < entec_bs_seed_v2.sql

# 5. Re-create test users
docker exec backend-service node seed.js
```

You're back at step 5 of first-time setup.

---

## Useful inspection commands

```bash
# Show running containers
docker ps

# Tail one service's logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f db

# Open a psql prompt against the live DB
docker exec -it iep_engine_db psql -U admin -d iep_engine

# One-off SQL query
docker exec iep_engine_db psql -U admin -d iep_engine -c "SELECT email FROM users LIMIT 5;"

# Open a shell in the backend container
docker exec -it backend-service sh

# Run the algorithm + regression tests
docker exec backend-service node tests/algorithm.test.js
docker exec backend-service node tests/iep-regression.test.js
```

---

## Stopping the app

```bash
# Stop containers (data preserved)
docker-compose stop

# Stop and remove containers (data preserved in volume)
docker-compose down

# Stop, remove containers, AND delete the postgres volume
docker-compose down -v
```

---

## Troubleshooting

### `Cannot connect to the Docker daemon`
Docker Desktop isn't running. Open it and wait for the whale icon to settle.

### `Bind for 0.0.0.0:5432 failed: port is already allocated`
Another Postgres is running on your host. Stop it (`Stop-Service postgresql-x64-15` on Windows, `brew services stop postgresql` on macOS) or change the port mapping in `docker-compose.yml`.

### `BS-ISTS degree model not found` when running `seed.js`
You skipped step 3. Apply the SQL seed first:
```bash
docker exec -i iep_engine_db psql -U admin -d iep_engine < entec_bs_seed_v2.sql
```

### `column "total_credits_required" does not exist` or other column-missing errors
The backend hasn't finished its startup migrations. Restart it and wait for the `Migrations applied.` line:
```bash
docker-compose restart backend
docker-compose logs -f backend
```

### Picker on onboarding shows fewer than 6 programs
The curated `program_model` rows are missing or the picker filter (≥ 20 rows) excluded them. Re-run steps 3 and 4:
```bash
docker exec -i iep_engine_db psql -U admin -d iep_engine < entec_bs_seed_v2.sql
docker exec backend-service node seed.js
```

### Frontend shows blank page or 404
Check the frontend container is up: `docker ps | grep frontend-service`. If yes, hard-refresh the browser (`Ctrl+Shift+R`). If no, `docker-compose up -d --build frontend`.

### Backend won't start: `Error: Cannot find module 'pg'`
The backend image was built before dependencies were installed. Force rebuild:
```bash
docker-compose up -d --build backend
```

### Code change isn't showing up
Containers serve a baked-in copy of the source. After editing files in `server/` or `client/`, rebuild that service:
```bash
docker-compose up -d --build backend   # for server/ changes
docker-compose up -d --build frontend  # for client/ changes
```

For quick iteration without a full rebuild, you can `docker cp` the changed file into the running container — but that's a hot-patch, not a permanent fix.

---

## Quick reference

| Task | Command |
|---|---|
| First-time setup | `docker-compose up -d --build` → apply SQL → `node seed.js` |
| Daily start | `docker-compose up -d` |
| Stop everything | `docker-compose down` |
| Reseed users only | `docker exec backend-service node seed.js` |
| Full nuke + re-seed | `docker-compose down -v && docker-compose up -d --build` then steps 3–4 |
| Tail backend logs | `docker-compose logs -f backend` |
| Open psql | `docker exec -it iep_engine_db psql -U admin -d iep_engine` |
| Run tests | `docker exec backend-service node tests/iep-regression.test.js` |
| App URL | http://localhost:5173 |
| API URL | http://localhost:3001 |
