import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query } from './db.js';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import { generateStoryDeck } from './storyDeck.js';
import { generateStoryFlowPdf } from './storyFlowPdf.js';
import { parseAndAnalyze } from './analyticsParser.js';
import { askOllama, isOllamaConfigured } from './ollamaService.js';
import { runForecast } from './forecastService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10);

app.use(cors());
app.use(express.json());

// File upload setup for MSME certificates and datasets
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '..', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// --- Helpers ---
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Missing token' });
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

function adminOrEmployeeMiddleware(req, res, next) {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'EMPLOYEE')) {
    return res.status(403).json({ message: 'Admin or employee access required' });
  }
  next();
}

// Email transport for sending OTPs via email
let mailTransporter = null;
if (process.env.SMTP_HOST) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

// --- Auth & Onboarding ---

// Start signup: validate against master, send OTP
app.post('/auth/signup/start', upload.single('msme_certificate'), async (req, res) => {
  try {
    const { udhayam_id, company_name, owner_name, contact_number } = req.body;
    if (!udhayam_id || !company_name || !owner_name || !contact_number) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const certPath = req.file ? req.file.path : null;

    const masterRes = await query(
      `SELECT * FROM msme_master WHERE udhayam_id = $1`,
      [udhayam_id]
    );

    let isValid = false;
    let masterId = null;
    let masterMobile = null;
    let masterEmail = null;
    if (masterRes.rows.length > 0) {
      const m = masterRes.rows[0];
      const ownerMatch =
        owner_name.trim().toLowerCase() === (m.primary_owner || '').toLowerCase() ||
        owner_name.trim().toLowerCase() === (m.secondary_owner || '').toLowerCase();
      const companyMatch = company_name.trim().toLowerCase() === m.company_name.toLowerCase();
      if (ownerMatch && companyMatch) {
        isValid = true;
        masterId = m.id;
        // Always use the registered MSME contact details for OTP.
        masterMobile = m.mobile_number;
        masterEmail = m.email;
      }
    }

    const signupRes = await query(
      `INSERT INTO msme_signups
       (udhayam_id, company_name, owner_name, contact_number, msme_certificate_url,
        is_valid_master_match, master_msme_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        udhayam_id,
        company_name,
        owner_name,
        contact_number,
        certPath,
        isValid,
        masterId,
        isValid ? 'OTP_SENT' : 'REJECTED'
      ]
    );

    if (!isValid) {
      return res.status(400).json({ message: 'Details do not match our MSME records.' });
    }

    const signupId = signupRes.rows[0].id;
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await query(
      `INSERT INTO msme_otps (msme_user_temp_id, otp_code, mobile_number, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [signupId, otp, masterMobile || contact_number, expiresAt]
    );

    // Send OTP via email if SMTP is configured and we have an email address
    let emailSent = false;
    if (mailTransporter && masterEmail) {
      try {
        await mailTransporter.sendMail({
          from: process.env.SMTP_FROM || '"MSME Onboarding" <no-reply@example.com>',
          to: masterEmail,
          subject: 'Your MSME onboarding OTP',
          text: `Your OTP for MSME onboarding is ${otp}. It is valid for ${OTP_EXPIRY_MINUTES} minutes.`,
          html: `<p>Your OTP for MSME onboarding is <strong>${otp}</strong>. It is valid for ${OTP_EXPIRY_MINUTES} minutes.</p>`
        });
        emailSent = true;
        console.log(`OTP email sent to ${masterEmail}`);
      } catch (e) {
        console.error('Failed to send OTP email:', e.message || e);
      }
    } else {
      if (!masterEmail) console.warn('No MSME email on record; OTP not emailed.');
      if (!mailTransporter) console.warn('SMTP not configured; set SMTP_* in .env for OTP emails.');
    }

    // Always log OTP to console for testing (e.g. if using Mailtrap, check Mailtrap inbox)
    console.log(
      `OTP for signup ${signupId} (email ${masterEmail || 'n/a'}): ${otp}`
    );

    return res.json({
      message: emailSent
        ? 'OTP sent to your registered email. Enter it below to complete sign-up.'
        : 'OTP generated. Check your email, or the server console if testing.',
      signup_id: signupId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Verify OTP and create platform user
app.post('/auth/signup/verify-otp', async (req, res) => {
  try {
    const { signup_id, otp } = req.body;
    if (!signup_id || !otp) {
      return res.status(400).json({ message: 'Missing signup_id or otp' });
    }

    const signupRes = await query(`SELECT * FROM msme_signups WHERE id = $1`, [signup_id]);
    if (signupRes.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid signup' });
    }
    const signup = signupRes.rows[0];
    if (!signup.is_valid_master_match) {
      return res.status(400).json({ message: 'Signup is not valid' });
    }

    const otpRes = await query(
      `SELECT * FROM msme_otps
       WHERE msme_user_temp_id = $1 AND otp_code = $2 AND used = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [signup_id, otp]
    );
    if (otpRes.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    const otpRow = otpRes.rows[0];
    if (new Date(otpRow.expires_at) < new Date()) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    await query(`UPDATE msme_otps SET used = TRUE WHERE id = $1`, [otpRow.id]);
    await query(`UPDATE msme_signups SET status = 'COMPLETED' WHERE id = $1`, [signup_id]);

    const masterRes = await query(
      `SELECT * FROM msme_master WHERE id = $1`,
      [signup.master_msme_id]
    );
    const master = masterRes.rows[0];

    const userRes = await query(
      `INSERT INTO msme_users
       (msme_master_id, udhayam_id, company_name, contact_number, email, role, parent_company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (udhayam_id, role) DO UPDATE
       SET contact_number = EXCLUDED.contact_number, email = EXCLUDED.email
       RETURNING id, role`,
      [
        signup.master_msme_id,
        signup.udhayam_id,
        signup.company_name,
        signup.contact_number,
        master.email,
        'OWNER',
        signup.master_msme_id
      ]
    );

    const user = userRes.rows[0];
    const token = jwt.sign(
      { userId: user.id, udhayam_id: signup.udhayam_id, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    return res.json({ token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Login: step 1 – request OTP sent to registered email
app.post('/auth/login/request-otp', async (req, res) => {
  try {
    const udhayam_id = req.body.udhayam_id ? String(req.body.udhayam_id).trim() : '';
    if (!udhayam_id) return res.status(400).json({ message: 'Udhayam ID required' });

    const userRes = await query(
      `SELECT u.id, u.udhayam_id, u.role, m.email
       FROM msme_users u
       JOIN msme_master m ON u.msme_master_id = m.id
       WHERE u.udhayam_id = $1 LIMIT 1`,
      [udhayam_id]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: 'No account found for this Udhayam ID. Please sign up first.' });
    }
    const user = userRes.rows[0];
    const email = user.email;
    if (!email) {
      return res.status(400).json({ message: 'No email on record for this account. Contact support.' });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    try {
      await query(
        `INSERT INTO login_otps (udhayam_id, otp_code, email, expires_at) VALUES ($1,$2,$3,$4)`,
        [udhayam_id, otp, email, expiresAt]
      );
    } catch (dbErr) {
      if (dbErr.code === '42P01' || (dbErr.message && dbErr.message.includes('login_otps'))) {
        return res.status(503).json({
          message: 'Login OTP table not set up. In Supabase run: CREATE TABLE login_otps (id SERIAL PRIMARY KEY, udhayam_id VARCHAR(50) NOT NULL, otp_code VARCHAR(10) NOT NULL, email VARCHAR(255) NOT NULL, expires_at TIMESTAMP NOT NULL, used BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW());'
        });
      }
      throw dbErr;
    }

    let emailSent = false;
    if (mailTransporter) {
      try {
        await mailTransporter.sendMail({
          from: process.env.SMTP_FROM || '"MSME Onboarding" <no-reply@example.com>',
          to: email,
          subject: 'Your MSME login OTP',
          text: `Your login OTP is ${otp}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
          html: `<p>Your login OTP is <strong>${otp}</strong>. Valid for ${OTP_EXPIRY_MINUTES} minutes.</p>`
        });
        emailSent = true;
        console.log(`Login OTP email sent to ${email}`);
      } catch (e) {
        console.error('Failed to send login OTP email:', e.message || e);
      }
    }
    console.log(`Login OTP for ${udhayam_id} (${email}): ${otp}`);

    if (emailSent) {
      return res.json({ message: 'OTP sent to your registered email address.' });
    }
    return res.json({
      message: 'OTP generated. Email could not be sent (check SMTP in .env). Use the OTP shown in the server console for testing.',
      otp_for_testing: process.env.NODE_ENV !== 'production' ? otp : undefined
    });
  } catch (err) {
    console.error('Login request-otp error:', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Login: step 2 – verify OTP and return JWT
app.post('/auth/login/verify-otp', async (req, res) => {
  try {
    const { udhayam_id, otp } = req.body;
    const udhayamId = udhayam_id ? String(udhayam_id).trim() : '';
    if (!udhayamId || !otp) {
      return res.status(400).json({ message: 'Udhayam ID and OTP required' });
    }

    const otpRes = await query(
      `SELECT id, expires_at FROM login_otps
       WHERE udhayam_id = $1 AND otp_code = $2 AND used = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [udhayamId, String(otp).trim()]
    );
    if (otpRes.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
    const otpRow = otpRes.rows[0];
    if (new Date(otpRow.expires_at) < new Date()) {
      return res.status(400).json({ message: 'OTP has expired. Request a new one.' });
    }

    await query(`UPDATE login_otps SET used = TRUE WHERE id = $1`, [otpRow.id]);

    const userRes = await query(
      `SELECT u.id, u.role, u.udhayam_id FROM msme_users u WHERE u.udhayam_id = $1 LIMIT 1`,
      [udhayamId]
    );
    const user = userRes.rows[0];
    const token = jwt.sign(
      { userId: user.id, udhayam_id: user.udhayam_id, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
    return res.json({ token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// --- Dashboard Overview ---
app.get('/dashboard/overview', authMiddleware, async (req, res) => {
  try {
    const userRes = await query(
      `SELECT u.id as user_id, u.msme_master_id, m.*
       FROM msme_users u
       JOIN msme_master m ON u.msme_master_id = m.id
       WHERE u.id = $1`,
      [req.user.userId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: 'User/company not found' });
    }
    const company = userRes.rows[0];

    // Simple demand summary using trade relations
    const demandRes = await query(
      `SELECT product_name,
              SUM(estimated_monthly_demand) AS total_demand_units,
              COUNT(DISTINCT buyer_msme_id) AS potential_buyers,
              SUM(CASE WHEN location_match THEN 1 ELSE 0 END) AS local_buyers
       FROM msme_trade_relations
       WHERE seller_msme_id = $1
       GROUP BY product_name`,
      [company.id]
    );

    const buyFromRes = await query(
      `SELECT tr.product_name,
              s.company_name AS supplier_name,
              s.location,
              s.mobile_number AS contact_number
       FROM msme_trade_relations tr
       JOIN msme_master s ON tr.seller_msme_id = s.id
       WHERE tr.buyer_msme_id = $1
       ORDER BY tr.estimated_monthly_value DESC
       LIMIT 10`,
      [company.id]
    );

    const sellToRes = await query(
      `SELECT tr.product_name,
              b.company_name AS buyer_name,
              b.location,
              b.email,
              tr.estimated_monthly_demand,
              tr.location_match
       FROM msme_trade_relations tr
       JOIN msme_master b ON tr.buyer_msme_id = b.id
       WHERE tr.seller_msme_id = $1
       ORDER BY tr.estimated_monthly_demand DESC
       LIMIT 10`,
      [company.id]
    );

    return res.json({
      company: {
        udhayam_id: company.udhayam_id,
        company_name: company.company_name,
        business_type: company.business_type,
        location: company.location
      },
      product_demand_summary: demandRes.rows,
      buy_from: buyFromRes.rows,
      sell_to: sellToRes.rows
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// --- Chatbot 1: Supply & demand info ---
app.post('/chat/supply-demand', authMiddleware, async (req, res) => {
  try {
    const { question, raw_material, product } = req.body;
    const q = (question || '').toLowerCase();

    // Very simple intent detection
    const wantsSuppliers =
      q.includes('supplier') ||
      q.includes('buy') ||
      q.includes('source') ||
      !!raw_material;
    const wantsDemand =
      q.includes('demand') ||
      q.includes('who will buy') ||
      q.includes('buyers') ||
      !!product;

    const userCompanyRes = await query(
      `SELECT u.id as user_id, m.*
       FROM msme_users u
       JOIN msme_master m ON u.msme_master_id = m.id
       WHERE u.id = $1`,
      [req.user.userId]
    );
    const company = userCompanyRes.rows[0];

    const responses = {};

    if (wantsSuppliers) {
      const material = raw_material || q;
      const suppliersRes = await query(
        `SELECT DISTINCT s.company_name, s.location, s.mobile_number AS contact_number
         FROM msme_trade_relations tr
         JOIN msme_master s ON tr.seller_msme_id = s.id
         WHERE LOWER(tr.product_name) LIKE '%' || LOWER($1) || '%'`,
        [material]
      );
      responses.suppliers = suppliersRes.rows;
    }

    if (wantsDemand) {
      const prod = product || q;
      const demandRes = await query(
        `SELECT tr.product_name,
                SUM(tr.estimated_monthly_demand) AS total_demand_units,
                COUNT(DISTINCT tr.buyer_msme_id) AS potential_buyers
         FROM msme_trade_relations tr
         WHERE LOWER(tr.product_name) LIKE '%' || LOWER($1) || '%'
         GROUP BY tr.product_name`,
        [prod]
      );
      const buyersRes = await query(
        `SELECT DISTINCT b.company_name, b.email
         FROM msme_trade_relations tr
         JOIN msme_master b ON tr.buyer_msme_id = b.id
         WHERE LOWER(tr.product_name) LIKE '%' || LOWER($1) || '%'`,
        [prod]
      );
      responses.demand = demandRes.rows;
      responses.buyers = buyersRes.rows;
    }

    if (!wantsSuppliers && !wantsDemand) {
      return res.json({
        message:
          'Ask about suppliers for a raw material or demand for a product. For example: "Who can supply wheat flour in my city?" or "What is the demand for packaged snacks?"'
      });
    }

    // Ensure we only expose allowed fields
    return res.json({
      company_context: {
        company_name: company.company_name,
        location: company.location
      },
      ...responses
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// --- Analytics: upload + basic summary + forecast logging ---

app.post(
  '/analytics/upload',
  authMiddleware,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'File is required' });
      }
      const filePath = req.file.path;
      const originalFilename = req.file.originalname;

      let schemaJson = { columns: [], analysis: null };
      try {
        const parsed = parseAndAnalyze(filePath);
        schemaJson = { columns: parsed.columns, analysis: parsed.analysis };
      } catch (parseErr) {
        console.warn('Parse failed, storing without analysis:', parseErr.message);
      }

      const datasetRes = await query(
        `INSERT INTO uploaded_datasets
         (msme_user_id, original_filename, file_url, schema_json)
         VALUES ($1,$2,$3,$4)
         RETURNING id`,
        [req.user.userId, originalFilename, filePath, schemaJson]
      );

      return res.json({
        dataset_id: datasetRes.rows[0].id,
        message: schemaJson.analysis ? 'File uploaded and analysed. View KPIs and charts below.' : 'File uploaded. Analysis could not be run on this file format.'
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

function getLastDayOfMonth(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  const last = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

// Performance summary from uploaded dataset analysis; supports filters
// Always returns 200 with valid dashboard shape (stub when no data or on error)
app.get('/analytics/summary', authMiddleware, async (req, res) => {
  function stub() {
    const sales_trend = [
      { month: 'Jan 2024', monthKey: '2024-01', value: 80000 }, { month: 'Feb 2024', monthKey: '2024-02', value: 90000 },
      { month: 'Mar 2024', monthKey: '2024-03', value: 110000 }, { month: 'Apr 2024', monthKey: '2024-04', value: 130000 },
      { month: 'May 2024', monthKey: '2024-05', value: 125000 }, { month: 'Jun 2024', monthKey: '2024-06', value: 140000 }
    ];
    const daily_sales_trend = ['2024-01-15', '2024-01-20', '2024-02-10', '2024-03-05', '2024-04-08', '2024-05-11', '2024-06-03'].map((d, i) => ({ date: d, dateLabel: d, value: [85000, 42000, 92000, 51000, 45000, 58000, 140000][i] }));
    const cumulative_and_wow = ['2024-01-07', '2024-01-14', '2024-01-21', '2024-02-04', '2024-02-11'].map((wk, i) => ({ weekKey: wk, weekLabel: wk, value: [120000, 135000, 128000, 140000, 155000][i], cumulative_sales: [120000, 255000, 383000, 523000, 678000][i], wow_pct: [0, 12.5, -5.2, 9.4, 10.7][i] }));
    const product_breakdown = [
      { product: 'Packaged Snacks', value: 500000 }, { product: 'Beverages', value: 300000 },
      { product: 'Personal Care', value: 200000 }, { product: 'Dairy', value: 150000 }
    ];
    const region_breakdown = [
      { region: 'Chennai', value: 450000 }, { region: 'Mumbai', value: 350000 }, { region: 'Delhi', value: 350000 }
    ];
    const top10_products_by_volume = product_breakdown.slice(0, 4).map((p, i) => ({ ...p, volume: [5200, 3100, 2100, 1500][i] }));
    const total_sales = product_breakdown.reduce((s, p) => s + p.value, 0);
    return {
      dataset_id: null,
      kpis: {
        total_sales,
        total_sales_pct_change_vs_last_week: 8.2,
        total_quantity_sold: 13800,
        total_quantity_sold_pct_change_vs_last_week: 5.1,
        total_profit: 175000,
        total_profit_pct_change_vs_last_week: 10.3,
        avg_profit_margin: 14.0,
        total_invoice_count: 1250,
        total_invoice_count_pct_change_vs_last_week: 3.0,
        avg_monthly_growth_pct: 12.5,
        top_product: 'Packaged Snacks',
        top_region: 'Chennai'
      },
      charts: { sales_trend, daily_sales_trend, cumulative_and_wow, product_breakdown, region_breakdown, payment_breakdown: [], top10_products_by_volume, price_vs_quantity: [] },
      filter_options: { products: ['Packaged Snacks', 'Beverages', 'Personal Care', 'Dairy'], locations: ['Chennai', 'Mumbai', 'Delhi'] }
    };
  }

  try {
  const { dataset_id, from, to, product, region, location } = req.query;
  const loc = location || region;

  let dataset = null;
  try {
    if (dataset_id) {
      const r = await query(
        `SELECT id, schema_json FROM uploaded_datasets WHERE id = $1 AND msme_user_id = $2`,
        [dataset_id, req.user.userId]
      );
      dataset = r.rows[0];
    }
    if (!dataset) {
      const r = await query(
        `SELECT id, schema_json FROM uploaded_datasets WHERE msme_user_id = $1 ORDER BY uploaded_at DESC LIMIT 1`,
        [req.user.userId]
      );
      dataset = r.rows[0];
    }
  } catch (dbErr) {
    console.error(dbErr);
  }

  if (!dataset || !dataset.schema_json?.analysis) {
    return res.json(stub());
  }

  const analysis = dataset.schema_json.analysis;
  const rawProduct = analysis.product_breakdown || [];
  const rawRegion = analysis.region_breakdown || [];
  const fromStr = from ? String(from).trim() : '';
  const toStr = to ? String(to).trim() : '';

  let sales_trend, product_breakdown, region_breakdown, payment_breakdown, total_sales, avg_monthly_growth_pct, top_product, top_region;
  let total_quantity_sold = 0;
  let total_sales_pct_change_vs_last_week = null;
  let total_quantity_sold_pct_change_vs_last_week = null;
  let total_profit = 0;
  let total_profit_pct_change_vs_last_week = null;
  let avg_profit_margin = null;
  let total_invoice_count = 0;
  let total_invoice_count_pct_change_vs_last_week = null;
  let daily_sales_trend = [];
  let cumulative_and_wow = [];
  let top10_products_by_volume = [];
  let price_vs_quantity = [];

  if (Array.isArray(analysis.raw_rows) && analysis.raw_rows.length > 0) {
    let rows = analysis.raw_rows;
    if (fromStr) {
      const fromVal = fromStr.length >= 10 ? fromStr : fromStr.slice(0, 7) + '-01';
      rows = rows.filter((r) => {
        const rowDate = r.date || (r.monthKey ? r.monthKey + '-01' : '');
        return rowDate && rowDate >= fromVal;
      });
    }
    if (toStr) {
      const toVal = toStr.length >= 10 ? toStr : (toStr.length >= 7 ? getLastDayOfMonth(toStr.slice(0, 7)) : toStr);
      rows = rows.filter((r) => {
        const rowDate = r.date || (r.monthKey ? r.monthKey + '-01' : '');
        return rowDate && rowDate <= toVal;
      });
    }
    if (product) {
      const p = String(product).toLowerCase();
      rows = rows.filter((r) => String(r.product || '').toLowerCase() === p || String(r.product || '').toLowerCase().includes(p));
    }
    if (loc) {
      const r = String(loc).toLowerCase();
      rows = rows.filter((row) => String(row.region || '').toLowerCase() === r || String(row.region || '').toLowerCase().includes(r));
    }

    const byMonth = {};
    const byDate = {};
    const byWeek = {};
    const byWeekQty = {};
    const byWeekProfit = {};
    const byWeekCount = {};
    const byProduct = {};
    const byRegion = {};
    const byPayment = {};
    const productVolume = {};
    const priceQuantityPoints = [];
    for (const row of rows) {
      const v = row.value || 0;
      const qty = row.quantity > 0 ? row.quantity : 0;
      const profit = row.profit != null && !Number.isNaN(row.profit) ? row.profit : 0;
      byMonth[row.monthKey] = (byMonth[row.monthKey] || 0) + v;
      if (row.date) byDate[row.date] = (byDate[row.date] || 0) + v;
      if (row.weekKey) {
        byWeek[row.weekKey] = (byWeek[row.weekKey] || 0) + v;
        byWeekQty[row.weekKey] = (byWeekQty[row.weekKey] || 0) + qty;
        byWeekProfit[row.weekKey] = (byWeekProfit[row.weekKey] || 0) + profit;
        byWeekCount[row.weekKey] = (byWeekCount[row.weekKey] || 0) + 1;
      }
      const prod = row.product || 'Other';
      byProduct[prod] = (byProduct[prod] || 0) + v;
      const vol = (row.quantity > 0 ? row.quantity : v);
      productVolume[prod] = (productVolume[prod] || 0) + vol;
      const reg = row.region || 'Other';
      byRegion[reg] = (byRegion[reg] || 0) + v;
      if (row.payment_mode) byPayment[row.payment_mode] = (byPayment[row.payment_mode] || 0) + v;
      if (row.price > 0 && (row.quantity > 0 || v > 0)) {
        priceQuantityPoints.push({ price: row.price, quantity: row.quantity > 0 ? row.quantity : Math.round(v / row.price) });
      }
    }
    total_sales = rows.reduce((s, r) => s + (r.value || 0), 0);
    total_quantity_sold = rows.reduce((s, r) => s + (r.quantity > 0 ? r.quantity : 0), 0);
    total_profit = rows.reduce((s, r) => s + (r.profit != null && !Number.isNaN(r.profit) ? r.profit : 0), 0);
    total_invoice_count = rows.length;
    avg_profit_margin = total_sales > 0 ? Math.round((total_profit / total_sales) * 1000) / 10 : null;
    const weekKeys = Object.keys(byWeek).sort();
    if (weekKeys.length >= 2) {
      const lastWk = weekKeys[weekKeys.length - 1];
      const prevWk = weekKeys[weekKeys.length - 2];
      const lastSales = byWeek[lastWk] || 0;
      const prevSales = byWeek[prevWk] || 0;
      const lastQty = byWeekQty[lastWk] || 0;
      const prevQty = byWeekQty[prevWk] || 0;
      const lastProfit = byWeekProfit[lastWk] || 0;
      const prevProfit = byWeekProfit[prevWk] || 0;
      const lastCount = byWeekCount[lastWk] || 0;
      const prevCount = byWeekCount[prevWk] || 0;
      total_sales_pct_change_vs_last_week = prevSales > 0 ? Math.round(((lastSales - prevSales) / prevSales) * 1000) / 10 : 0;
      total_quantity_sold_pct_change_vs_last_week = prevQty > 0 ? Math.round(((lastQty - prevQty) / prevQty) * 1000) / 10 : 0;
      total_profit_pct_change_vs_last_week = prevProfit !== 0 ? Math.round(((lastProfit - prevProfit) / prevProfit) * 1000) / 10 : 0;
      total_invoice_count_pct_change_vs_last_week = prevCount > 0 ? Math.round(((lastCount - prevCount) / prevCount) * 1000) / 10 : 0;
    }

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthKeys = Object.keys(byMonth).sort();
    sales_trend = monthKeys.map((k) => {
      const [y, m] = k.split('-').map(Number);
      return { month: `${MONTHS[m - 1]} ${y}`, monthKey: k, value: Math.round(byMonth[k]) };
    });
    const dateKeys = Object.keys(byDate).sort();
    daily_sales_trend = dateKeys.map((d) => ({ date: d, dateLabel: d, value: Math.round(byDate[d]) }));
    let cum = 0;
    cumulative_and_wow = weekKeys.map((wk, i) => {
      const weekVal = byWeek[wk];
      cum += weekVal;
      const prevVal = i > 0 ? byWeek[weekKeys[i - 1]] : 0;
      const wow_pct = prevVal > 0 ? Math.round(((weekVal - prevVal) / prevVal) * 1000) / 10 : 0;
      return { weekKey: wk, weekLabel: wk, value: Math.round(weekVal), cumulative_sales: Math.round(cum), wow_pct };
    });
    product_breakdown = Object.entries(byProduct)
      .map(([product, value]) => ({ product, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
    region_breakdown = Object.entries(byRegion)
      .map(([region, value]) => ({ region, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
    top10_products_by_volume = Object.entries(productVolume)
      .map(([product, volume]) => ({ product, volume: Math.round(volume), value: Math.round(byProduct[product] || 0) }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);
    payment_breakdown = Object.entries(byPayment)
      .map(([payment_mode, value]) => ({ payment_mode, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    const byPrice = new Map();
    for (const p of priceQuantityPoints) {
      const key = Number(Number(p.price).toFixed(2));
      const prev = byPrice.get(key) || { priceSum: 0, quantitySum: 0, count: 0 };
      prev.priceSum += p.price;
      prev.quantitySum += p.quantity || 0;
      prev.count += 1;
      byPrice.set(key, prev);
    }
    price_vs_quantity = Array.from(byPrice.entries())
      .map(([priceKey, v]) => ({
        price: Math.round((v.priceSum / v.count) * 100) / 100,
        quantity: Math.round(v.quantitySum),
        count: v.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 500);

    avg_monthly_growth_pct = 0;
    if (sales_trend.length >= 2 && total_sales) {
      const first = sales_trend[0].value || 0;
      const last = sales_trend[sales_trend.length - 1].value || 0;
      if (first > 0) avg_monthly_growth_pct = Math.round(((last - first) / first) * 100 * 10) / 10;
    }
    top_product = product_breakdown[0]?.product || '—';
    top_region = region_breakdown[0]?.region || '—';
  } else {
    daily_sales_trend = analysis.daily_sales_trend || [];
    cumulative_and_wow = analysis.cumulative_and_wow || [];
    top10_products_by_volume = analysis.top10_products_by_volume || [];
    price_vs_quantity = analysis.price_vs_quantity || [];
    let sales_trend_r = analysis.sales_trend || [];
    let product_breakdown_r = [...rawProduct];
    let region_breakdown_r = [...rawRegion];
    let payment_breakdown_r = analysis.payment_breakdown || [];
    const fromMonth = fromStr.length >= 7 ? fromStr.slice(0, 7) : '';
    const toMonth = toStr.length >= 7 ? toStr.slice(0, 7) : '';

    if (fromMonth || toMonth) {
      sales_trend_r = sales_trend_r.filter((d) => {
        const k = d.monthKey || (d.month && /^\d{4}-\d{2}$/.test(d.month) ? d.month : null);
        if (!k) return true;
        if (fromMonth && k < fromMonth) return false;
        if (toMonth && k > toMonth) return false;
        return true;
      });
    }
    if (product) {
      const p = String(product).toLowerCase();
      product_breakdown_r = product_breakdown_r.filter((d) => String(d.product).toLowerCase() === p || String(d.product).toLowerCase().includes(p));
    }
    if (loc) {
      const r = String(loc).toLowerCase();
      region_breakdown_r = region_breakdown_r.filter((d) => String(d.region).toLowerCase() === r || String(d.region).toLowerCase().includes(r));
    }

    sales_trend = sales_trend_r;
    product_breakdown = product_breakdown_r;
    region_breakdown = region_breakdown_r;
    payment_breakdown = payment_breakdown_r;
    total_sales = product_breakdown.reduce((s, d) => s + (d.value || 0), 0) || sales_trend.reduce((s, d) => s + (d.value || 0), 0);
    avg_monthly_growth_pct = analysis.kpis?.avg_monthly_growth_pct ?? 0;
    if (sales_trend.length >= 2 && total_sales) {
      const first = sales_trend[0].value || 0;
      const last = sales_trend[sales_trend.length - 1].value || 0;
      if (first > 0) avg_monthly_growth_pct = Math.round(((last - first) / first) * 100 * 10) / 10;
    }
    top_product = product_breakdown[0]?.product || analysis.kpis?.top_product || '—';
    top_region = region_breakdown[0]?.region || analysis.kpis?.top_region || '—';
    total_quantity_sold = analysis.kpis?.total_quantity_sold ?? 0;
    total_profit = analysis.kpis?.total_profit ?? 0;
    avg_profit_margin = analysis.kpis?.avg_profit_margin ?? null;
    total_invoice_count = analysis.kpis?.total_invoice_count ?? 0;
    total_sales_pct_change_vs_last_week = analysis.kpis?.total_sales_pct_change_vs_last_week ?? null;
    total_quantity_sold_pct_change_vs_last_week = analysis.kpis?.total_quantity_sold_pct_change_vs_last_week ?? null;
    total_profit_pct_change_vs_last_week = analysis.kpis?.total_profit_pct_change_vs_last_week ?? null;
    total_invoice_count_pct_change_vs_last_week = analysis.kpis?.total_invoice_count_pct_change_vs_last_week ?? null;
    if (!daily_sales_trend?.length) daily_sales_trend = analysis.daily_sales_trend || [];
    if (!cumulative_and_wow?.length) cumulative_and_wow = analysis.cumulative_and_wow || [];
    if (!top10_products_by_volume?.length) top10_products_by_volume = analysis.top10_products_by_volume || [];
    if (!price_vs_quantity?.length) price_vs_quantity = analysis.price_vs_quantity || [];
  }

  const filter_options = {
    products: [...new Set(rawProduct.map((d) => d.product).filter(Boolean))],
    locations: [...new Set(rawRegion.map((d) => d.region).filter(Boolean))]
  };

  return res.json({
    dataset_id: dataset.id,
    kpis: {
      total_sales: Math.round(total_sales || 0),
      total_sales_pct_change_vs_last_week: total_sales_pct_change_vs_last_week != null ? total_sales_pct_change_vs_last_week : null,
      total_quantity_sold: Math.round(total_quantity_sold || 0),
      total_quantity_sold_pct_change_vs_last_week: total_quantity_sold_pct_change_vs_last_week != null ? total_quantity_sold_pct_change_vs_last_week : null,
      total_profit: Math.round(total_profit || 0),
      total_profit_pct_change_vs_last_week: total_profit_pct_change_vs_last_week != null ? total_profit_pct_change_vs_last_week : null,
      avg_profit_margin: avg_profit_margin != null ? avg_profit_margin : null,
      total_invoice_count: total_invoice_count || 0,
      total_invoice_count_pct_change_vs_last_week: total_invoice_count_pct_change_vs_last_week != null ? total_invoice_count_pct_change_vs_last_week : null,
      avg_monthly_growth_pct: avg_monthly_growth_pct ?? 0,
      top_product: top_product || '—',
      top_region: top_region || '—'
    },
    charts: {
      sales_trend,
      daily_sales_trend,
      cumulative_and_wow,
      product_breakdown,
      region_breakdown,
      payment_breakdown,
      top10_products_by_volume,
      price_vs_quantity
    },
    filter_options
  });
  } catch (err) {
    console.error('Analytics summary error:', err);
    return res.json(stub());
  }
});

// List user's datasets for filter dropdown
app.get('/analytics/datasets', authMiddleware, async (req, res) => {
  try {
    const r = await query(
      `SELECT id, original_filename, uploaded_at FROM uploaded_datasets WHERE msme_user_id = $1 ORDER BY uploaded_at DESC LIMIT 20`,
      [req.user.userId]
    );
    return res.json({ datasets: r.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Forecast endpoint: multi-model weekly forecast with accuracy-based selection
// Supports same filters as dashboard: product, location (store/region), and dataset_id.
app.get('/analytics/forecast', authMiddleware, async (req, res) => {
  const params = { horizon_weeks: 13 };

  try {
    const { dataset_id, product, region, location } = req.query;
    const dsId = dataset_id ? parseInt(dataset_id, 10) : null;
    const loc = location || region;

    let weekly_historical = [];
    try {
      // Load analysis from chosen or latest dataset
      const whereSql = dsId
        ? `WHERE id = $1 AND msme_user_id = $2`
        : `WHERE msme_user_id = $1 ORDER BY uploaded_at DESC LIMIT 1`;
      const paramsArr = dsId ? [dsId, req.user.userId] : [req.user.userId];
      const r = await query(
        `SELECT schema_json FROM uploaded_datasets ${whereSql}`,
        paramsArr
      );
      const analysis = r.rows[0]?.schema_json?.analysis;
      if (analysis) {
        const rawRows = Array.isArray(analysis.raw_rows) ? analysis.raw_rows : [];
        if (rawRows.length > 0 && (product || loc)) {
          // Filter at row level, then aggregate to weekly series for this product/location
          let rows = rawRows;
          if (product) {
            const p = String(product).toLowerCase();
            rows = rows.filter((row) => {
              const rp = String(row.product || '').toLowerCase();
              return rp === p || rp.includes(p);
            });
          }
          if (loc) {
            const rLoc = String(loc).toLowerCase();
            rows = rows.filter((row) => {
              const rr = String(row.region || '').toLowerCase();
              return rr === rLoc || rr.includes(rLoc);
            });
          }
          const byWeek = {};
          for (const row of rows) {
            const wk = row.weekKey || row.week || row.weekLabel;
            if (!wk) continue;
            const v = Number(row.value) || 0;
            if (v <= 0) continue;
            byWeek[wk] = (byWeek[wk] || 0) + v;
          }
          const weekKeys = Object.keys(byWeek).sort();
          weekly_historical = weekKeys.map((wk) => ({
            week: wk,
            value: Math.round(byWeek[wk])
          }));
        } else {
          // Fall back to pre-aggregated weekly series
          const cw = analysis.cumulative_and_wow || [];
          weekly_historical = (cw || []).map((w) => ({
            week: w.weekLabel || w.weekKey,
            value: Number(w.value) || 0
          }));
        }
      }
    } catch (e) {
      console.error('Forecast: analysis load/filter error', e);
    }

    const result = await runForecast(weekly_historical, params.horizon_weeks);

    try {
      await query(
        `INSERT INTO forecast_runs (msme_user_id, dataset_id, model_name, parameters_json)
         VALUES ($1,$2,$3,$4)`,
        [req.user.userId, dsId, result.model_name, params]
      );
    } catch (_) {}

    return res.json({
      model_name: result.model_name,
      accuracy: result.accuracy,
      weekly_historical: result.weekly_historical,
      weekly_forecast: result.weekly_forecast,
      forecast: result.weekly_forecast,
      forecast_lower: result.forecast_lower || null,
      forecast_upper: result.forecast_upper || null,
      insights: result.insights
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Chatbot 2: answers from performance dashboard / uploaded dataset (Ollama LLM when configured, else rule-based)
app.post('/chat/analytics', authMiddleware, async (req, res) => {
  const { question, history } = req.body;
  const q = (question || '').trim();
  if (!q) return res.status(400).json({ message: 'Please enter a question.' });

  // --- Load latest dataset analysis (same source as dashboard) ---
  let data = null;
  try {
    const r = await query(
      `SELECT schema_json FROM uploaded_datasets WHERE msme_user_id = $1 ORDER BY uploaded_at DESC LIMIT 1`,
      [req.user.userId]
    );
    if (r.rows[0]?.schema_json?.analysis) data = r.rows[0].schema_json.analysis;
  } catch (_) {}

  const qLower = q.toLowerCase();

  // Helpers to parse dates from question (supports 01/01/2025, 2025-01-01, and 1st Jan 2025)
  function toIsoFromYMD(y, m, d) {
    const year = Number(y);
    const month = Number(m) - 1;
    const day = Number(d);
    const dt = new Date(year, month, day);
    if (Number.isNaN(dt.getTime())) return null;
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function findDatesInQuestion(text) {
    const found = [];
    const seen = new Set();
    const t = text;

    // Numeric formats: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd
    const reNumeric = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g;
    let m;
    while ((m = reNumeric.exec(t)) !== null) {
      let iso = null;
      if (m[1] && m[2] && m[3]) {
        // yyyy-mm-dd
        iso = toIsoFromYMD(m[1], m[2], m[3]);
      } else if (m[4] && m[5] && m[6]) {
        // dd/mm/yyyy (assume day-first for MSME context)
        const day = m[4];
        const month = m[5];
        const year = m[6].length === 2 ? `20${m[6]}` : m[6];
        iso = toIsoFromYMD(year, month, day);
      }
      if (iso && !seen.has(iso)) {
        seen.add(iso);
        found.push(iso);
      }
    }

    // Textual month names: 1st Jan 2025, 01 jan 2025, etc.
    const monthMap = {
      jan: 1, january: 1,
      feb: 2, february: 2,
      mar: 3, march: 3,
      apr: 4, april: 4,
      may: 5,
      jun: 6, june: 6,
      jul: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, sept: 9, september: 9,
      oct: 10, october: 10,
      nov: 11, november: 11,
      dec: 12, december: 12
    };
    const reText = /(\d{1,2})(st|nd|rd|th)?\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{4})/gi;
    while ((m = reText.exec(t)) !== null) {
      const day = m[1];
      const monthName = m[3].toLowerCase();
      const year = m[4];
      const month = monthMap[monthName];
      if (!month) continue;
      const iso = toIsoFromYMD(year, month, day);
      if (iso && !seen.has(iso)) {
        seen.add(iso);
        found.push(iso);
      }
    }

    return found;
  }

  function getSalesForDate(analysis, isoDate) {
    if (!analysis) return null;
    const daily = analysis.daily_sales_trend || [];
    const rows = analysis.raw_rows || [];
    let total = 0;
    let invoices = 0;

    if (daily.length) {
      const hit = daily.find((d) => d.date === isoDate || d.dateLabel === isoDate);
      if (hit) {
        total = Number(hit.value) || 0;
      }
    }
    if (rows.length) {
      for (const r of rows) {
        if (r.date === isoDate) {
          total += Number(r.value) || 0;
          invoices += 1;
        }
      }
    }
    if (!total && !invoices) return null;
    return { total, invoices };
  }

  function getSalesForRange(analysis, fromIso, toIso) {
    if (!analysis) return null;
    const rows = analysis.raw_rows || [];
    const daily = analysis.daily_sales_trend || [];
    let total = 0;
    let invoices = 0;

    if (rows.length) {
      for (const r of rows) {
        if (!r.date) continue;
        if (r.date >= fromIso && r.date <= toIso) {
          total += Number(r.value) || 0;
          invoices += 1;
        }
      }
    } else if (daily.length) {
      for (const d of daily) {
        const dt = d.date || d.dateLabel;
        if (!dt) continue;
        if (dt >= fromIso && dt <= toIso) {
          total += Number(d.value) || 0;
        }
      }
    }
    if (!total && !invoices) return null;
    return { total, invoices };
  }

  function buildDataNotes(analysis) {
    if (!analysis) return '';
    const notes = [];
    const daily = analysis.daily_sales_trend || [];
    if (daily.length) {
      const zeroDays = daily.filter((d) => !d.value || Number(d.value) === 0).length;
      if (zeroDays / daily.length > 0.3) {
        notes.push(`Many days (${zeroDays} of ${daily.length}) have zero or missing sales. Check data completeness or when you started recording transactions.`);
      }
    }
    const salesTrend = analysis.sales_trend || [];
    if (salesTrend.length > 0 && salesTrend.length < 3) {
      notes.push(`Only ${salesTrend.length} months of history are available; longer history would make trends and forecasts more reliable.`);
    }
    const payment = analysis.payment_breakdown || [];
    if (!payment.length) {
      notes.push('No payment mode breakdown is available (no payment/mode column detected).');
    }
    const products = analysis.product_breakdown || [];
    if (products.length) {
      const total = products.reduce((s, p) => s + (Number(p.value) || 0), 0) || 1;
      const other = products.find((p) => String(p.product || '').toLowerCase() === 'other');
      if (other && (other.value || 0) / total > 0.3) {
        notes.push('A large share of sales is tagged as "Other" in product breakdown; consider cleaning product names for clearer insights.');
      }
    }
    return notes.join(' ');
  }

  // Try to answer at the most granular level (dates / ranges) before LLM
  if (data) {
    const dates = findDatesInQuestion(q);
    const wantsSales = qLower.includes('sale') || qLower.includes('revenue') || qLower.includes('amount') || qLower.includes('turnover');

    let structuredMessage = '';

    if (wantsSales && dates.length === 1) {
      const iso = dates[0];
      const info = getSalesForDate(data, iso);
      if (info) {
        const pretty = iso.split('-').reverse().join('-'); // dd-mm-yyyy
        structuredMessage = `On **${pretty}**, your total sales were **₹${Number(info.total).toLocaleString()}**` +
          (info.invoices ? ` from **${info.invoices}** invoice(s).` : '.');
      }
    } else if (wantsSales && dates.length >= 2) {
      const fromIso = dates[0];
      const toIso = dates[1];
      const info = getSalesForRange(data, fromIso, toIso);
      if (info) {
        const prettyFrom = fromIso.split('-').reverse().join('-');
        const prettyTo = toIso.split('-').reverse().join('-');
        structuredMessage = `From **${prettyFrom}** to **${prettyTo}**, your total sales were **₹${Number(info.total).toLocaleString()}**` +
          (info.invoices ? ` across **${info.invoices}** invoice(s).` : '.');
      }
    }

    if (structuredMessage) {
      const notes = buildDataNotes(data);
      if (notes) {
        structuredMessage += `\n\n**Data notes:** ${notes}`;
      }
      return res.json({ message: structuredMessage, source: 'rules-structured' });
    }
  }

  // --- Forecast context (for trend / future questions and LLM) ---
  const cw = data?.cumulative_and_wow || [];
  const weeklyHistorical = (cw || []).map((w) => ({ week: w.weekLabel || w.weekKey, value: Number(w.value) || 0 }));
  const forecastResult = runForecast(weeklyHistorical, 4);
  const forecastSummary = `Sales forecast: model ${forecastResult.model_name}, accuracy ${forecastResult.accuracy}. Next 4 weeks: ${(forecastResult.weekly_forecast || []).map((f) => `${f.week} ₹${Number(f.value).toLocaleString()}`).join(', ')}.`;

  // Try Ollama next: include dataset + forecast in context
  if (isOllamaConfigured()) {
    const ollamaReply = await askOllama(data, q, Array.isArray(history) ? history : [], forecastSummary);
    if (ollamaReply) {
      return res.json({ message: ollamaReply, source: 'ollama' });
    }
  }

  // Fallback: rule-based answers from the same dataset analysis and forecast, with some trend / data-quality insight
  const kpis = data?.kpis || {};
  const totalSales = kpis.total_sales ?? 1250000;
  const topProduct = kpis.top_product || 'Packaged Snacks';
  const topRegion = kpis.top_region || 'Chennai';
  const growth = kpis.avg_monthly_growth_pct ?? 12.5;
  const productBreakdown = data?.product_breakdown || [];
  const regionBreakdown = data?.region_breakdown || [];
  const paymentBreakdown = data?.payment_breakdown || [];
  const weeklyForecast = forecastResult.weekly_forecast || [];

  let message = '';

  if (qLower.includes('hello') || qLower.includes('hi') || qLower.includes('hey')) {
    message = "Hello! I'm your analytics assistant. Ask me about your sales, top products, store locations, payment modes, trends, or **forecast**—I'll answer from your data and forecast.";
  } else if (qLower.includes('thank') || qLower.includes('thanks')) {
    message = "You're welcome! Ask anything else about your performance.";
  } else if ((qLower.includes('forecast') || qLower.includes('predict') || qLower.includes('future')) && (qLower.includes('next') || qLower.includes('week') || qLower.includes('sales') || qLower.includes('what') || qLower.includes('how'))) {
    if (weeklyForecast.length) {
      const lines = weeklyForecast.map((f) => `**${f.week}**: ₹${Number(f.value).toLocaleString()}`);
      message = `Sales forecast (model: **${forecastResult.model_name}**, accuracy: **${forecastResult.accuracy}**): ${lines.join('; ')}. You can also click "View sales forecast" on the dashboard for the chart.`;
    } else {
      message = 'Not enough weekly history to produce a forecast. Upload a dataset with date and sales, then try "View sales forecast" on the dashboard.';
    }
  } else if (qLower.includes('accuracy') && (qLower.includes('model') || qLower.includes('forecast'))) {
    message = `The forecast model **${forecastResult.model_name}** has an accuracy of **${forecastResult.accuracy}** (based on fit to your historical weekly sales).`;
  } else if (qLower.includes('top') && (qLower.includes('product') || qLower.includes('selling'))) {
    const top3 = productBreakdown.slice(0, 3);
    if (top3.length) {
      const pct = totalSales ? Math.round((top3[0].value / totalSales) * 100) : 0;
      message = `Your top product is **${topProduct}** (about ${pct}% of revenue). Next: ${top3.slice(1).map((p) => p.product).join(', ')}.`;
    } else message = `Your top product from the data is **${topProduct}**.`;
  } else if (qLower.includes('region') || qLower.includes('city') || qLower.includes('location') || qLower.includes('store')) {
    if (regionBreakdown.length) {
      message = `**${topRegion}** leads sales. Other locations: ${regionBreakdown.slice(1, 4).map((r) => r.region).join(', ')}.`;
    } else message = `Your top store location from the data is **${topRegion}**.`;
  } else if (qLower.includes('payment') || qLower.includes('pay mode') || qLower.includes('upi') || qLower.includes('card') || qLower.includes('cash')) {
    if (paymentBreakdown.length) {
      const top = paymentBreakdown[0];
      message = `Sales by payment mode: ${paymentBreakdown.map((p) => `${p.payment_mode} ₹${Number(p.value).toLocaleString()}`).join(', ')}. Top: **${top.payment_mode}** (₹${Number(top.value).toLocaleString()}).`;
    } else message = 'No payment mode breakdown in the uploaded dataset. Upload data with a payment/mode column.';
  } else if (qLower.includes('forecast') || qLower.includes('predict') || qLower.includes('future')) {
    if (weeklyForecast.length) {
      message = `Your sales forecast for the next 4 weeks: ${weeklyForecast.map((f) => `${f.week} ₹${Number(f.value).toLocaleString()}`).join(', ')}. Model: **${forecastResult.model_name}** (accuracy ${forecastResult.accuracy}).`;
    } else {
      message = 'Upload a dataset with weekly or date-wise sales to see a forecast. Then ask "What is my sales forecast for next week?"';
    }
  } else if (qLower.includes('total sales') || qLower.includes('revenue') || qLower.includes('how much')) {
    const lakh = (totalSales / 100000).toFixed(1);
    message = `Total sales from your data: **₹${Number(totalSales).toLocaleString()}** (${lakh} lakh).`;
  } else if (qLower.includes('growth') || qLower.includes('improve') || qLower.includes('trend')) {
    message = `Your average monthly growth is **${growth}%**. The Sales trend chart shows the month-by-month picture.`;
    const notes = buildDataNotes(data);
    if (notes) {
      message += `\n\n**Data notes:** ${notes}`;
    }
  } else if (qLower.includes('loop hole') || qLower.includes('loophole') || qLower.includes('data quality') || qLower.includes('issue') || qLower.includes('black box')) {
    const notes = buildDataNotes(data);
    if (notes) {
      message = `Here are some observations about your data quality and potential blind spots:\n\n- ${notes.replace(/\.\s+/g, '.\n- ')}`;
    } else {
      message = 'I did not detect major data-quality issues from the available summary. You can upload more history or more detailed fields (like payment mode, store hierarchy) for deeper checks.';
    }
  } else if (qLower.includes('help') || qLower.includes('what can you')) {
    message = 'I answer from your **uploaded dataset** and **forecast**: total sales, top product, store location, payment mode, trends, granular day/range queries (e.g. "sales on 01/01/2025"), and forecast (next 4 weeks, model accuracy). Try: "What is my total sales?", "What were my sales on 01/01/2025?", or "What is the sales forecast for next month?".';
  } else {
    message = `From your data: total sales **₹${Number(totalSales).toLocaleString()}**, top product **${topProduct}**, top location **${topRegion}**. You can also ask about **specific dates or ranges** (e.g. "What were my sales on 01/01/2025?" or "Sales between 01/01/2025 and 07/01/2025") or the **forecast** (e.g. "What is my forecast for next week?").`;
  }

  return res.json({ message, source: 'rules' });
});

// Story deck: generate PPTX or PDF (story flow). ?format=pdf returns PDF.
app.get('/analytics/story-deck', authMiddleware, async (req, res) => {
  try {
    const format = (req.query.format || '').toLowerCase();
    const isPdf = format === 'pdf';

    let summary = {
      kpis: { total_sales: 1250000, avg_monthly_growth_pct: 12.5, top_product: 'Packaged Snacks', top_region: 'Chennai' },
      charts: {
        sales_trend: [
          { month: 'Jan', value: 80000 }, { month: 'Feb', value: 90000 }, { month: 'Mar', value: 110000 },
          { month: 'Apr', value: 130000 }, { month: 'May', value: 125000 }, { month: 'Jun', value: 140000 }
        ],
        product_breakdown: [
          { product: 'Packaged Snacks', value: 500000 }, { product: 'Beverages', value: 300000 },
          { product: 'Personal Care', value: 200000 }, { product: 'Dairy', value: 150000 }
        ]
      }
    };
    try {
      const ds = await query(
        `SELECT schema_json FROM uploaded_datasets WHERE msme_user_id = $1 ORDER BY uploaded_at DESC LIMIT 1`,
        [req.user.userId]
      );
      if (ds.rows[0]?.schema_json?.analysis) {
        const a = ds.rows[0].schema_json.analysis;
        summary = { kpis: a.kpis || summary.kpis, charts: { sales_trend: a.sales_trend || summary.charts.sales_trend, product_breakdown: a.product_breakdown || summary.charts.product_breakdown } };
      }
    } catch (_) {}
    const forecast = {
      model_name: 'StubForecastModel-v1',
      forecast: [
        { date: '2026-03-01', value: 140000 }, { date: '2026-04-01', value: 155000 },
        { date: '2026-05-01', value: 170000 }
      ]
    };
    let companyName = 'Your MSME';
    try {
      const u = await query(
        `SELECT m.company_name FROM msme_users u JOIN msme_master m ON u.msme_master_id = m.id WHERE u.id = $1`,
        [req.user.userId]
      );
      if (u.rows[0]) companyName = u.rows[0].company_name;
    } catch (_) {}

    if (isPdf) {
      const buffer = await generateStoryFlowPdf(summary, forecast, companyName);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="msme-story-deck.pdf"');
      res.send(buffer);
      return;
    }

    const buffer = await generateStoryDeck(summary, forecast, companyName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', 'attachment; filename="msme-story-deck.pptx"');
    res.send(buffer);
  } catch (err) {
    console.error('Story deck error:', err);
    res.status(500).json({ message: err.message || 'Failed to generate story deck' });
  }
});

// --- Admin routes (for app creators/employees; no Udhayam ID) ---

// Admin login: email + password; returns JWT with role ADMIN
app.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const adminEmailEnv = process.env.ADMIN_EMAIL ? String(process.env.ADMIN_EMAIL).trim().toLowerCase() : '';
    const adminPassEnv = process.env.ADMIN_PASSWORD || '';

    let admin = null;

    try {
      const adminRes = await query(
        `SELECT id, email, password_hash, COALESCE(role, 'ADMIN') AS role FROM admin_users WHERE email = $1`,
        [emailNorm]
      );

      if (adminRes.rows.length > 0) {
        admin = adminRes.rows[0];
        const match = await bcrypt.compare(password, admin.password_hash);
        if (!match) {
          return res.status(401).json({ message: 'Invalid email or password' });
        }
        admin.role = admin.role || 'ADMIN';
      } else if (adminEmailEnv && adminPassEnv && emailNorm === adminEmailEnv && password === adminPassEnv) {
        // First-time: create admin from env and log in (role ADMIN)
        const hash = await bcrypt.hash(password, 10);
        const insertRes = await query(
          `INSERT INTO admin_users (email, password_hash, name, role) VALUES ($1,$2,$3,'ADMIN') RETURNING id, email, COALESCE(role, 'ADMIN') AS role`,
          [adminEmailEnv, hash, 'Admin']
        );
        admin = insertRes.rows[0];
        admin.role = admin.role || 'ADMIN';
      } else {
        return res.status(401).json({
          message: 'Invalid email or password. First time? Set ADMIN_EMAIL and ADMIN_PASSWORD in backend .env and create admin_users table in Supabase.'
        });
      }
    } catch (dbErr) {
      if (dbErr.code === '42P01' || (dbErr.message && dbErr.message.includes('admin_users'))) {
        return res.status(503).json({
          message: 'Admin table not set up. In Supabase SQL Editor run: CREATE TABLE admin_users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, password_hash TEXT NOT NULL, name VARCHAR(255), created_at TIMESTAMP DEFAULT NOW());'
        });
      }
      throw dbErr;
    }

    const token = jwt.sign(
      { userId: admin.id, role: admin.role || 'ADMIN', email: admin.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({ token });
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Add app employee (admin_users with role EMPLOYEE). Only ADMIN. Password is generated and returned once.
function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < length; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

app.post('/admin/employees', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !name) {
      return res.status(400).json({ message: 'Email and name required' });
    }
    const emailNorm = String(email).trim().toLowerCase();
    const plainPassword = generatePassword(12);
    const hash = await bcrypt.hash(plainPassword, 10);

    const insertRes = await query(
      `INSERT INTO admin_users (email, password_hash, name, role) VALUES ($1,$2,$3,'EMPLOYEE') RETURNING id, email, name, role, created_at`,
      [emailNorm, hash, String(name).trim()]
    );
    const employee = insertRes.rows[0];
    return res.json({ employee: { id: employee.id, email: employee.email, name: employee.name, role: employee.role }, password: plainPassword });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'An employee with this email already exists.' });
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// List app employees (admin_users). Only ADMIN can see this.
app.get('/admin/employees', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const res_ = await query(
      `SELECT id, email, name, role, created_at FROM admin_users ORDER BY created_at DESC`
    );
    return res.json({ employees: res_.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// List MSME users (Users DB). Both ADMIN and EMPLOYEE can view.
app.get('/admin/users', authMiddleware, adminOrEmployeeMiddleware, async (req, res) => {
  try {
    const usersRes = await query(
      `SELECT u.id, u.udhayam_id, u.company_name, u.role, u.contact_number, u.email, m.location
       FROM msme_users u
       JOIN msme_master m ON u.msme_master_id = m.id
       ORDER BY u.created_at DESC
       LIMIT 100`
    );
    return res.json({ users: usersRes.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Health check (for load balancers and monitoring)
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'msme-onboarding-backend' });
});

// In production, optionally serve the frontend build (single-server deployment)
const isProduction = process.env.NODE_ENV === 'production';
const frontendDist = process.env.FRONTEND_DIST || (isProduction ? path.join(__dirname, '..', '..', 'frontend', 'dist') : null);
if (frontendDist && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/auth') || req.path.startsWith('/dashboard') || req.path.startsWith('/analytics') || req.path.startsWith('/admin') || req.path.startsWith('/chat') || req.path.startsWith('/upload') || req.path.startsWith('/rules') || req.path.startsWith('/health')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.send('MSME onboarding backend is running. Set NODE_ENV=production and build frontend to serve the app.'));
}

app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
  if (frontendDist && fs.existsSync(frontendDist)) console.log('Serving frontend from', frontendDist);
});

