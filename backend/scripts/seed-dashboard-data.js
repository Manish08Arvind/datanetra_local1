/**
 * Seed 200 MSME companies (192 new + 8 existing) and trade relations for
 * MSME Opportunity dashboard and supply/demand chatbot.
 * Run from backend: node scripts/seed-dashboard-data.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const LOCATIONS = [
  'Chennai', 'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Kolkata', 'Pune', 'Ahmedabad',
  'Coimbatore', 'Madurai', 'Kochi', 'Jaipur', 'Lucknow', 'Nagpur', 'Indore', 'Bhopal',
  'Surat', 'Vadodara', 'Ludhiana', 'Chandigarh', 'Guwahati', 'Thiruvananthapuram',
  'Visakhapatnam', 'Bhubaneswar', 'Ranchi', 'Mysuru', 'Mangaluru', 'Tiruchirappalli'
];

const BUSINESS_TYPES = ['fmcg', 'clothing', 'electronic', 'supermarket'];

const COMPANY_PREFIXES = {
  fmcg: ['Sai', 'Green', 'Metro', 'Prime', 'Fresh', 'Sunrise', 'Bharat', 'Swadeshi', 'Annapurna', 'Prakash'],
  clothing: ['Comfort', 'Urban', 'Style', 'Classic', 'Trendy', 'Royal', 'Elite', 'Fashion', 'Weave', 'Silk'],
  electronic: ['Spark', 'Digital', 'Tech', 'Smart', 'Power', 'Volt', 'Circuit', 'Logic', 'Pixel', 'Nexus'],
  supermarket: ['City', 'Metro', 'Daily', 'Mega', 'Super', 'Local', 'Neighbour', 'Quick', 'Easy', 'Value']
};

const COMPANY_SUFFIXES = {
  fmcg: ['Traders', 'Foods', 'Distributors', 'Agency', 'Supplies', 'Mart', 'Store', 'Hub', 'Corp', 'Pvt Ltd'],
  clothing: ['Wear', 'Textiles', 'Garments', 'Fashion', 'Apparel', 'Boutique', 'Store', 'House', 'Ltd', 'Co'],
  electronic: ['Electronics', 'Devices', 'Solutions', 'Systems', 'Hub', 'World', 'Store', 'Labs', 'Pvt Ltd', 'Inc'],
  supermarket: ['Supermarket', 'Mart', 'Store', 'Bazaar', 'Mall', 'Retail', 'Provisions', 'Hypermarket', 'Ltd', 'Co']
};

const PRODUCTS_BY_TYPE = {
  fmcg: ['Packaged Snacks', 'Beverages', 'Wheat Flour', 'Rice', 'Cooking Oil', 'Pulses', 'Spices', 'Personal Care', 'Dairy', 'Biscuits'],
  clothing: ['Cotton Fabric', 'Readymade Garments', 'Uniforms', 'Textiles', 'Sarees', 'Shirts', 'Denim', 'Woolens', 'Accessories', 'Footwear'],
  electronic: ['POS Systems', 'LED Displays', 'Cables', 'Batteries', 'Power Banks', 'Audio Equipment', 'Lighting', 'Components', 'Inverters', 'Sensors'],
  supermarket: ['Groceries', 'FMCG Supplies', 'Fresh Produce', 'Household Items', 'Beverages', 'Snacks', 'Dairy', 'Frozen Foods', 'Personal Care', 'Stationery']
};

function pick(arr, i) {
  return arr[i % arr.length];
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

async function run() {
  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT COUNT(*) AS c FROM msme_master');
    const count = parseInt(existing.rows[0].c, 10);
    if (count >= 200) {
      console.log('Already have 200+ MSMEs. Skipping msme_master insert.');
    } else {
      const toInsert = 200 - count;
      console.log(`Inserting ${toInsert} new MSME companies (existing: ${count})...`);
      for (let i = 0; i < toInsert; i++) {
        const n = count + i + 1;
        const udhayamId = `UDH${String(n).padStart(3, '0')}`;
        const type = pick(BUSINESS_TYPES, n + i * 7);
        const location = pick(LOCATIONS, n + i * 11);
        const pre = pick(COMPANY_PREFIXES[type], n);
        const suf = pick(COMPANY_SUFFIXES[type], i);
        const companyName = `${pre} ${suf}`.trim();
        const primaryOwner = `Owner${n}`;
        const secondaryOwner = `Partner${n}`;
        const gstin = `29${String(n).padStart(10, '0')}Z${n % 10}`;
        const mobile = `9${String(randomBetween(100000000, 999999999))}`;
        const email = `contact${n}@msme${type}.in`;
        await client.query(
          `INSERT INTO msme_master (udhayam_id, company_name, primary_owner, secondary_owner, gstin, business_type, location, mobile_number, email)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (udhayam_id) DO NOTHING`,
          [udhayamId, companyName, primaryOwner, secondaryOwner, gstin, type, location, mobile, email]
        );
      }
    }

    const maxIdRes = await client.query('SELECT COALESCE(MAX(id),0) AS mx FROM msme_master');
    const maxId = parseInt(maxIdRes.rows[0].mx, 10);
    const minIdRes = await client.query('SELECT MIN(id) AS mn FROM msme_master');
    const minId = parseInt(minIdRes.rows[0].mn, 10) || 1;
    console.log(`msme_master id range: ${minId} to ${maxId}`);

    const relCount = await client.query('SELECT COUNT(*) AS c FROM msme_trade_relations');
    if (parseInt(relCount.rows[0].c, 10) >= 200) {
      console.log('Trade relations already seeded.');
    } else {
      console.log('Inserting trade relations...');
      const types = await client.query('SELECT id, business_type, location FROM msme_master');
      const companies = types.rows;
      let inserted = 0;
      for (let r = 0; r < 350; r++) {
        const buyer = companies[randomBetween(0, companies.length - 1)];
        let seller = companies[randomBetween(0, companies.length - 1)];
        if (buyer.id === seller.id) continue;
        const sellerType = seller.business_type;
        const productName = pick(PRODUCTS_BY_TYPE[sellerType], r + seller.id);
        const demand = randomBetween(100, 5000);
        const value = demand * randomBetween(10, 200);
        const locationMatch = buyer.location === seller.location;
        await client.query(
          `INSERT INTO msme_trade_relations (buyer_msme_id, seller_msme_id, product_name, estimated_monthly_demand, estimated_monthly_value, location_match)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [buyer.id, seller.id, productName, demand, value, locationMatch]
        );
        inserted++;
      }
      console.log(`Inserted ${inserted} trade relations.`);
    }

    console.log('Seed completed.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
