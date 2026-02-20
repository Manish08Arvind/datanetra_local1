/**
 * Update existing msme_master company names to new convention (no delete):
 * - Wholesalers (sellers): ProperNoun + Traders, Enterprise, Distributors, etc.
 * - Buyers: ProperNoun + Ltd. or Pvt Ltd.
 * Run from backend: node scripts/update-company-names.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const WHOLESALER_SUFFIXES = {
  fmcg: ['Traders', 'Enterprise', 'Distributors', 'Wholesalers', 'Supplies', 'Agency', 'Trading Co', 'Enterprises'],
  clothing: ['Traders', 'Enterprise', 'Distributors', 'Wholesalers', 'Supplies', 'Agency', 'Trading Co', 'Enterprises'],
  electronic: ['Traders', 'Enterprise', 'Distributors', 'Wholesalers', 'Supplies', 'Agency', 'Trading Co', 'Enterprises'],
  supermarket: ['Traders', 'Enterprise', 'Distributors', 'Wholesalers', 'Supplies', 'Agency', 'Trading Co', 'Enterprises']
};

const BUYER_SUFFIXES = {
  fmcg: ['Ltd.', 'Pvt Ltd.'],
  clothing: ['Ltd.', 'Pvt Ltd.'],
  electronic: ['Ltd.', 'Pvt Ltd.'],
  supermarket: ['Ltd.', 'Pvt Ltd.']
};

function pick(arr, index) {
  return arr[Math.abs(index) % arr.length];
}

function firstWord(str) {
  if (!str || typeof str !== 'string') return 'Company';
  const trimmed = str.trim();
  const match = trimmed.match(/^([A-Za-z0-9]+)/);
  return match ? match[1] : trimmed.split(/\s+/)[0] || 'Company';
}

async function run() {
  const client = await pool.connect();
  try {
    const companies = await client.query(
      'SELECT id, company_name, business_type FROM msme_master'
    );
    if (companies.rows.length === 0) {
      console.log('No companies in msme_master.');
      return;
    }

    const sellerCounts = await client.query(
      `SELECT seller_msme_id AS id, COUNT(*) AS cnt
       FROM msme_trade_relations GROUP BY seller_msme_id`
    );
    const buyerCounts = await client.query(
      `SELECT buyer_msme_id AS id, COUNT(*) AS cnt
       FROM msme_trade_relations GROUP BY buyer_msme_id`
    );
    const asSeller = Object.fromEntries(sellerCounts.rows.map((r) => [r.id, parseInt(r.cnt, 10)]));
    const asBuyer = Object.fromEntries(buyerCounts.rows.map((r) => [r.id, parseInt(r.cnt, 10)]));

    let updated = 0;
    for (const row of companies.rows) {
      const id = row.id;
      const sellerCnt = asSeller[id] || 0;
      const buyerCnt = asBuyer[id] || 0;
      const isWholesaler = sellerCnt >= buyerCnt;
      const businessType = row.business_type && WHOLESALER_SUFFIXES[row.business_type]
        ? row.business_type
        : 'fmcg';
      let prefix = firstWord(row.company_name);
      if (prefix.toLowerCase() === 'silk') prefix = 'Apex';
      const suffixes = isWholesaler ? WHOLESALER_SUFFIXES[businessType] : BUYER_SUFFIXES[businessType];
      const suffix = pick(suffixes, id);
      const newName = `${prefix} ${suffix}`.trim();

      const emailDomain = `contact${id}@msme${businessType}.in`;

      const needsUpdate =
        newName !== (row.company_name || '').trim() ||
        (row.email || '').toLowerCase() !== emailDomain.toLowerCase();

      if (!needsUpdate) continue;

      await client.query(
        'UPDATE msme_master SET company_name = $1, email = $2 WHERE id = $3',
        [newName, emailDomain, id]
      );
      updated++;
      console.log(`  ${row.company_name} (${row.email}) → ${newName} (${emailDomain})`);
    }

    console.log(`Done. Updated ${updated} company names (no data deleted).`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
