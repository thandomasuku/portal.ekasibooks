# eKasiBooks Portal (single-domain, fullstack)

This repo is a **Next.js** portal that includes its own backend (auth + session cookies) via **Next route handlers** and a **Postgres (Neon) database** using **Prisma**.

## What works out of the box
- Password login (`/api/auth/login`)
- Register (`/api/auth/register`)
- Session cookie (`ekasi_session`) + current user (`/api/auth/me`)
- Logout (`/api/auth/logout`)
- OTP flow scaffolding (`/api/auth/request-otp`, `/api/auth/verify-otp`)
  - In non-production, `request-otp` returns `{ devCode }` so you can test without SMS/email.
- Health check (`/api/health`) includes a DB connectivity check.

---

## Local dev
1) Create `.env.local`:

```env
DATABASE_URL="<your Neon connection string>"
AUTH_SECRET="<long random string>"
```

2) Install + migrate + run:

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Health check:
- `http://localhost:3000/api/health`

---

## Deploy (simple VPS)
### Prereqs
- A VPS (Ubuntu is easiest)
- A domain/subdomain pointing to the server (e.g. `portal.ekasibooks.co.za`)
- Docker installed

### Steps
1) Copy the project to the server and create a `.env` file next to `docker-compose.yml`:

```env
DATABASE_URL="<your Neon connection string>"
AUTH_SECRET="<long random string>"
```

2) Start it:

```bash
docker compose up -d --build
```

3) Run the DB migration once:

```bash
docker exec -it ekasi-portal npx prisma migrate deploy
```

4) Put Nginx/Apache (or your panel) in front to terminate SSL and proxy to `http://127.0.0.1:3000`.

---

## Env vars
- `DATABASE_URL` (required): Neon Postgres connection string
- `AUTH_SECRET` (required): secret used to sign session cookies
