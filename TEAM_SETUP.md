# Team Member Setup Guide

Two ways to connect depending on your use case:

---

## Option A — Browse the app (no local setup)

Just open your browser and go to:

```
https://iep-app.eejrr.cloudflareaccess.com
```

No installs needed. All data is stored on the host machine.

---

## Option B — Run the frontend locally (frontend development)

Use this if you want to make and test frontend changes locally while the backend and database run on the host machine.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git

### Steps

```powershell
# 1. Clone the repo
git clone https://github.com/your-org/Capstone-IEP.git
cd Capstone-IEP

# 2. Start the frontend container
docker-compose -f docker-compose.remote-db.yml up --build

# 3. Open the app
# http://localhost:5173
```

Your frontend proxies all `/api` calls to `https://iep-backend.eejrr.cloudflareaccess.com` (the host machine's backend).

---

## Option C — Run full stack locally via WARP (backend development)

Use this if you need to run and modify the backend locally while still connecting to the shared PostgreSQL database on the host machine.

> **Requirement:** QUIC (UDP 443) must be allowed on your network. This does **not** work if your router, ISP, or firewall blocks UDP traffic. If it fails, use Option B instead.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Cloudflare WARP](https://one.one.one.one/) client
- Git
- Access to the Zero Trust org (get the org name from the host)

### Steps

**1. Install and connect WARP**
- Download and install Cloudflare WARP
- Open WARP → Preferences → Account → Login with Cloudflare Zero Trust
- Enter the org name and log in
- Toggle WARP to **Connected**

**2. Clone and run**
```powershell
git clone https://github.com/your-org/Capstone-IEP.git
cd Capstone-IEP

docker-compose -f docker-compose.remote-db.yml up --build
```

**3. Open the app**
```
http://localhost:5173
```

Your backend resolves `iep.internal` through WARP → Cloudflare tunnel → host's PostgreSQL (port 5432).

### Troubleshooting Option C

| Error | Cause | Fix |
|---|---|---|
| `DB connection refused` | QUIC/UDP blocked on your network | Switch to Option B |
| `iep.internal not resolved` | WARP not connected or not logged in | Check WARP is toggled on and signed in |
| `ECONNREFUSED 5432` | Private network route not configured | Ask the host to verify the Cloudflare private network CIDR |

---

## Test accounts

| Role | Email | Password |
|---|---|---|
| Student | `student1@mdc.edu` | `password123` |
| Advisor | `advisor1@mdc.edu` | `password123` |

---

## Host machine setup (for reference)

The host runs the full stack via:
```powershell
docker-compose up -d
```

Services:
| Container | Port | Purpose |
|---|---|---|
| `iep_engine_db` | 5432 | PostgreSQL — single source of truth |
| `backend-service` | 3001 | Express API |
| `frontend-service` | 5173 | Vite dev server |
| `cloudflared-tunnel` | — | Cloudflare Tunnel connector |

Tunnel hostnames:
| Hostname | Routes to |
|---|---|
| `iep-app.eejrr.cloudflareaccess.com` | `frontend-service:5173` |
| `iep-backend.eejrr.cloudflareaccess.com` | `backend-service:3001` |
