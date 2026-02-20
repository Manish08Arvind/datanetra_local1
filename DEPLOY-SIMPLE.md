<<<<<<< HEAD
# Simplest way to host DataNetra (with Supabase)

You already have **Supabase** for the database. Use **Render** (free tier) to run your app in one place.

---

## 1. Get your Supabase database URL

1. Open [Supabase](https://supabase.com) → your project.
2. Go to **Project Settings** (gear) → **Database**.
3. Under **Connection string**, choose **URI**.
4. Copy the URL. It looks like:
   ```text
   postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with your actual database password (the one you set when creating the project). If you forgot it, you can reset it on the same page.

Keep this URL; you’ll add it to Render as `DATABASE_URL`.

---

## 2. Push your code to GitHub

If you haven’t already:

```bash
cd e:\DataNetraAI
git init
git add .
git commit -m "Initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

---

## 3. Deploy on Render

1. Go to [render.com](https://render.com) and sign up (or log in) with GitHub.
2. Click **New +** → **Web Service**.
3. Connect your **GitHub** account if needed, then select the **DataNetraAI** repo (or whatever you named it).
4. Use these settings:

   | Field | Value |
   |-------|--------|
   | **Name** | `datanetra` (or any name) |
   | **Region** | Pick one close to you |
   | **Root Directory** | Leave **blank** |
   | **Runtime** | **Node** |
   | **Build Command** | `cd frontend && npm install && npm run build && cd ../backend && npm install` |
   | **Start Command** | `cd backend && NODE_ENV=production node src/server.js` |

5. Click **Advanced** and add these **Environment Variables** (use **Add Environment Variable** for each):

   | Key | Value |
   |----|--------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Your full Supabase URI from step 1 |
   | `JWT_SECRET` | A long random string (e.g. run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and paste the output) |
   | `OTP_EXPIRY_MINUTES` | `10` |
   | `SMTP_HOST` | e.g. `smtp.gmail.com` (needed for login OTP emails) |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | Your email |
   | `SMTP_PASS` | App password (for Gmail: use an [App Password](https://support.google.com/accounts/answer/185833)) |
   | `SMTP_FROM` | `"DataNetra" <your-email@gmail.com>` |

   If you skip SMTP for now, signup/login OTP emails won’t send; you can add SMTP later.

6. Click **Create Web Service**. Render will build and deploy. Wait a few minutes.

7. When it’s live, open the URL Render shows (e.g. `https://datanetra.onrender.com`). That’s your app: same URL for the website and API.

---

## 4. Optional: custom domain

In your Render service → **Settings** → **Custom Domain**, add your domain and follow the DNS instructions.

---

## Summary

- **Database:** Supabase (you already have it). Use its **Database** → **Connection string (URI)** as `DATABASE_URL`.
- **Hosting:** Render, one Web Service, repo connected to GitHub.
- **Build:** Frontend builds to `frontend/dist`; backend serves it when `NODE_ENV=production`.
- **Result:** One URL (e.g. `https://yourservice.onrender.com`) for the whole app.

No separate frontend host, no CORS setup, no extra database on Render—just Supabase + Render.
=======
# Simplest way to host DataNetra (with Supabase)

You already have **Supabase** for the database. Use **Render** (free tier) to run your app in one place.

---

## 1. Get your Supabase database URL

1. Open [Supabase](https://supabase.com) → your project.
2. Go to **Project Settings** (gear) → **Database**.
3. Under **Connection string**, choose **URI**.
4. Copy the URL. It looks like:
   ```text
   postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with your actual database password (the one you set when creating the project). If you forgot it, you can reset it on the same page.

Keep this URL; you’ll add it to Render as `DATABASE_URL`.

---

## 2. Push your code to GitHub

If you haven’t already:

```bash
cd e:\DataNetraAI
git init
git add .
git commit -m "Initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

---

## 3. Deploy on Render

1. Go to [render.com](https://render.com) and sign up (or log in) with GitHub.
2. Click **New +** → **Web Service**.
3. Connect your **GitHub** account if needed, then select the **DataNetraAI** repo (or whatever you named it).
4. Use these settings:

   | Field | Value |
   |-------|--------|
   | **Name** | `datanetra` (or any name) |
   | **Region** | Pick one close to you |
   | **Root Directory** | Leave **blank** |
   | **Runtime** | **Node** |
   | **Build Command** | `cd frontend && npm install && npm run build && cd ../backend && npm install` |
   | **Start Command** | `cd backend && NODE_ENV=production node src/server.js` |

5. Click **Advanced** and add these **Environment Variables** (use **Add Environment Variable** for each):

   | Key | Value |
   |----|--------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Your full Supabase URI from step 1 |
   | `JWT_SECRET` | A long random string (e.g. run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and paste the output) |
   | `OTP_EXPIRY_MINUTES` | `10` |
   | `SMTP_HOST` | e.g. `smtp.gmail.com` (needed for login OTP emails) |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | Your email |
   | `SMTP_PASS` | App password (for Gmail: use an [App Password](https://support.google.com/accounts/answer/185833)) |
   | `SMTP_FROM` | `"DataNetra" <your-email@gmail.com>` |

   If you skip SMTP for now, signup/login OTP emails won’t send; you can add SMTP later.

6. Click **Create Web Service**. Render will build and deploy. Wait a few minutes.

7. When it’s live, open the URL Render shows (e.g. `https://datanetra.onrender.com`). That’s your app: same URL for the website and API.

---

## 4. Optional: custom domain

In your Render service → **Settings** → **Custom Domain**, add your domain and follow the DNS instructions.

---

## Summary

- **Database:** Supabase (you already have it). Use its **Database** → **Connection string (URI)** as `DATABASE_URL`.
- **Hosting:** Render, one Web Service, repo connected to GitHub.
- **Build:** Frontend builds to `frontend/dist`; backend serves it when `NODE_ENV=production`.
- **Result:** One URL (e.g. `https://yourservice.onrender.com`) for the whole app.

No separate frontend host, no CORS setup, no extra database on Render—just Supabase + Render.
>>>>>>> c79b8ff2a877fd428816588239e86ae0868b39f4
