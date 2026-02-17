# Hosting DataNetra (MSME Hub) as a Website

This app has a **React (Vite) frontend** and a **Node/Express backend** with **PostgreSQL**. You can host it in several ways.

---

## Option 1: Single server (backend serves frontend) — simplest

One server runs the API and serves the built frontend. Good for a VPS, Railway, or Render.

### 1. Set up PostgreSQL

- **Local:** Install PostgreSQL and create a database (e.g. `msme_db`).
- **Cloud:** Use [Neon](https://neon.tech), [Supabase](https://supabase.com), [Railway](https://railway.app) PostgreSQL, or [Render](https://render.com) PostgreSQL. Copy the connection string (e.g. `postgresql://user:pass@host:5432/dbname`).

### 2. Backend environment variables

In `backend/` create or edit `.env`:

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://user:password@host:5432/msme_db
JWT_SECRET=use_a_long_random_secret_here
OTP_EXPIRY_MINUTES=10

# SMTP for OTP emails (required for login/signup)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="DataNetra" <no-reply@yourdomain.com>

# Optional: first-time admin
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your_secure_password
```

### 3. Build the frontend (same origin as API)

From the **project root** (DataNetraAI):

```bash
cd frontend
npm install
npm run build
cd ..
```

The build goes to `frontend/dist`. The backend will serve it when `NODE_ENV=production` and that folder exists.

### 4. Run the backend

```bash
cd backend
npm install
node src/server.js
```

Or with a process manager (recommended on a server):

```bash
npm install -g pm2
cd backend
pm2 start src/server.js --name datanetra
pm2 save
pm2 startup
```

Open **http://localhost:4000** (or your server’s URL). The API and the website are on the same origin, so no CORS or `VITE_API_URL` is needed.

### 5. Optional: custom frontend build path

If the built frontend is not at `frontend/dist` relative to the backend:

```env
FRONTEND_DIST=/absolute/path/to/frontend/dist
```

---

## Option 2: Railway (backend + DB, frontend optional)

1. **Railway:** [railway.app](https://railway.app) — sign in with GitHub.
2. **New project** → Add **PostgreSQL** (copy `DATABASE_URL`).
3. **Add service** → Deploy from your repo (backend root = folder that has `backend/` and `frontend/`).
4. **Settings:**
   - **Root directory:** leave blank if repo root has both `backend` and `frontend`. If only backend is in the repo, set **Root directory** to `backend`.
   - **Build command:**  
     - If repo has both: `cd frontend && npm install && npm run build && cd ../backend && npm install`  
     - If backend only: `npm install`
   - **Start command:** `cd backend && node src/server.js` (or `node src/server.js` if root is `backend`).
5. **Variables:** Add all `backend/.env` variables in Railway’s **Variables** tab. Set `NODE_ENV=production`. Railway provides `PORT`.
6. **Serving frontend on Railway:**  
   After the build, the backend must see `frontend/dist`. So either:
   - Build in the same repo (build command above) and start from repo root with `cd backend && node src/server.js`, and ensure backend’s default path to frontend is `../frontend/dist` from `backend/`, or  
   - Set `FRONTEND_DIST` to the path where the build output is (e.g. `./frontend/dist` if you start from repo root and your start command is `node backend/src/server.js` — then in server, __dirname is backend/src, so `path.join(__dirname, '..', '..', 'frontend', 'dist')` is correct when you run from repo root as `node backend/src/server.js`).  
   Easiest: run **Start command** from repo root: `cd backend && npm install && node src/server.js`, and in the build step output `frontend/dist`. So from `backend/src/server.js`, `path.join(__dirname, '..', '..', 'frontend', 'dist')` = project root’s `frontend/dist`. Good.
7. **Domain:** In Railway, add a custom domain or use the generated `.railway.app` URL.

---

## Option 3: Render

1. **Render:** [render.com](https://render.com) — connect your repo.
2. **PostgreSQL:** Create a **PostgreSQL** instance and copy **Internal Database URL** (or External if you’ll connect from outside).
3. **Web Service:** New → connect repo.
   - **Root directory:** leave blank (or `backend` if you only deploy backend).
   - **Build:**  
     `cd frontend && npm install && npm run build && cd ../backend && npm install`  
     (or `npm install` if only backend).
   - **Start:** `cd backend && node src/server.js` (or `node src/server.js` if root is backend).
   - **Env:** Add all variables from `backend/.env`, set `NODE_ENV=production`. Render sets `PORT`.
4. Use the generated **.onrender.com** URL or add a custom domain.

---

## Option 4: Frontend and backend on different hosts

Example: **Vercel (frontend)** + **Railway or Render (backend)**.

### Backend (Railway or Render)

- Deploy only the backend (root = `backend` or build/start as above).
- Set `DATABASE_URL`, `JWT_SECRET`, SMTP, etc.
- Set **CORS:** the backend already uses `app.use(cors())`. For production you can restrict origin:
  - In `server.js` you can change to `cors({ origin: 'https://your-frontend.vercel.app' })` (or multiple origins).
- Note the backend URL (e.g. `https://your-app.railway.app`).

### Frontend (Vercel)

1. **Vercel:** [vercel.com](https://vercel.com) — import the repo.
2. **Root directory:** `frontend`.
3. **Build:** `npm run build`.
4. **Environment variable:**  
   `VITE_API_URL=https://your-backend.railway.app`  
   (no trailing slash). Vite bakes this into the build.
5. Deploy. The site will call your backend at `VITE_API_URL`.

---

## Option 5: VPS (Ubuntu / any Linux)

1. **Server:** Get a VM (DigitalOcean, AWS EC2, etc.) and SSH in.
2. **Node:** Install Node 18+ (e.g. `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs`).
3. **PostgreSQL:** `sudo apt install postgresql postgresql-contrib`, create user and database, set `DATABASE_URL`.
4. **Clone and build:**
   ```bash
   cd /var/www
   git clone <your-repo> datanetra
   cd datanetra/frontend && npm install && npm run build && cd ..
   cd backend && npm install
   ```
5. **Env:** Create `backend/.env` with production values. Do not set `VITE_API_URL` if the same server serves both (same origin).
6. **Process manager:**
   ```bash
   sudo npm i -g pm2
   cd /var/www/datanetra/backend
   pm2 start src/server.js --name datanetra
   pm2 save && pm2 startup
   ```
7. **Reverse proxy (recommended):** Put Nginx (or Caddy) in front so you can use HTTPS and a domain:
   ```nginx
   server {
     listen 80;
     server_name yourdomain.com;
     location / {
       proxy_pass http://127.0.0.1:4000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```
   Then use **Let’s Encrypt** (e.g. `certbot --nginx`) for HTTPS.

---

## Checklist before going live

- [ ] **PostgreSQL** running and `DATABASE_URL` correct.
- [ ] **JWT_SECRET** long and random (e.g. `openssl rand -base64 32`).
- [ ] **SMTP** configured so OTP emails are sent (login/signup).
- [ ] **NODE_ENV=production** in production.
- [ ] **Frontend build** created and either served by the same server (Option 1) or deployed with **VITE_API_URL** set (Option 4).
- [ ] **Health check:** `GET /health` returns `{ "ok": true }`.
- [ ] **HTTPS** enabled (via platform or Nginx/Caddy + Let’s Encrypt).

---

## Quick reference

| Scenario                         | Build frontend        | Run backend              | API URL for frontend   |
|---------------------------------|------------------------|---------------------------|-------------------------|
| Single server (same origin)     | `cd frontend && npm run build` | `cd backend && node src/server.js` | Not needed (same origin) |
| Frontend on Vercel, API elsewhere | In Vercel, set `VITE_API_URL`  | Railway/Render/VPS        | `VITE_API_URL` = backend URL |
