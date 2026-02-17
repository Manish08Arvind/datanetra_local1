# Backend scripts

## Dummy data for dashboard (Supabase)

The **MSME Opportunity dashboard** and **supply/demand chatbot** read from your backend database. When `DATABASE_URL` in `backend/.env` points to **Supabase**, the dashboard automatically uses that Supabase data.

### Option A: Run SQL in Supabase (recommended)

1. Open your project in **Supabase** → **SQL Editor** → **New query**.
2. Copy the contents of **`seed-dashboard-supabase.sql`** and paste into the editor.
3. Click **Run**.
4. This inserts 192 MSME companies (UDH009–UDH200) and 350 trade relations. With your existing 8 companies you’ll have 200 MSMEs and plenty of “buy from” / “sell to” data.

### Option B: Run Node seed script (same database)

1. In `backend/.env` set `DATABASE_URL` to your **Supabase** connection string (e.g. `postgres://postgres:...@...supabase.co:5432/postgres`).
2. From the backend folder run:
   ```bash
   cd e:\DataNetraAI\backend
   npm run seed:dashboard
   ```
3. Data is written to whatever database `DATABASE_URL` points to (Supabase if you set it that way).

### Dashboard connection

- The **frontend** calls the **backend API** (e.g. `http://localhost:4000` or your deployed API URL).
- The **backend** uses **`DATABASE_URL`** from `.env` for all queries (dashboard, login, admin, etc.).
- So: set **`DATABASE_URL`** to your **Supabase** URL → dashboard and chatbot use **Supabase** data.

No extra config is needed for the dashboard to “point to” Supabase; it’s determined by `DATABASE_URL`.
