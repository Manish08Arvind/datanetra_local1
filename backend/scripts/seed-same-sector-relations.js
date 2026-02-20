/**
 * Add more trade relations where buyer and seller have the SAME business_type.
 * Run this to get 2+ wholesalers and 2+ companies-in-need per sector in the opportunity dashboard.
 * Run from backend: node scripts/seed-same-sector-relations.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const BUSINESS_TYPES = ['fmcg', 'clothing', 'electronic', 'supermarket'];

const PRODUCTS_BY_TYPE = {
  fmcg: ['Packaged Snacks', 'Beverages', 'Wheat Flour', 'Rice', 'Cooking Oil', 'Pulses', 'Spices', 'Personal Care', 'Dairy', 'Biscuits'],
  clothing: ['Cotton Fabric', 'Readymade Garments', 'Uniforms', 'Textiles', 'Sarees', 'Shirts', 'Denim', 'Woolens', 'Accessories', 'Footwear'],
  electronic: ['POS Systems', 'LED Displays', 'Cables', 'Batteries', 'Power Banks', 'Audio Equipment', 'Lighting', 'Components', 'Inverters', 'Sensors'],
  supermarket: ['Groceries', 'FMCG Supplies', 'Fresh Produce', 'Household Items', 'Beverages', 'Snacks', 'Dairy', 'Frozen Foods', 'Personal Care', 'Stationery']
};

const WHOLESALER_SUFFIXES = {
  fmcg: ['Traders', 'Enterprise', 'Distributors', 'Wholesalers', 'Supplies', 'Agency', 'Trading Co', 'Enterprises'],
  clothing: ['Traders', 'Enterprise', 'Distributors', 'Wholesalers', 'Supplies', 'Agency', 'Trading Co', 'Enterprises'],
  electronic: ['Traders', 'Enterprise', 'Distributors', 'Wholesalers', 'Supplies', 'Agency', 'Trading Co', 'Enterprises'],
  supermarket: ['Traders', 'Enterprise', 'Distributors', 'Wholesalers', 'Supplies', 'Agency', 'Trading Co', 'Enterprises']
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
    const companies = await client.query(
      'SELECT id, business_type, location, company_name FROM msme_master'
    );
    const rows = companies.rows;

    function isWholesaler(c) {
      const suffixes = WHOLESALER_SUFFIXES[c.business_type] || [];
      return suffixes.some((s) => c.company_name && c.company_name.includes(s));
    }

    const sellersByType = {};
    const buyersByType = {};
    for (const t of BUSINESS_TYPES) {
      sellersByType[t] = rows.filter((c) => c.business_type === t && isWholesaler(c));
      buyersByType[t] = rows.filter((c) => c.business_type === t && !isWholesaler(c));
    }

    let inserted = 0;
    const targetPerType = 40;
    for (const businessType of BUSINESS_TYPES) {
      const sellers = sellersByType[businessType] || [];
      const buyers = buyersByType[businessType] || [];
      if (sellers.length === 0 || buyers.length === 0) {
        console.warn(`Skipping ${businessType}: need both sellers and buyers.`);
        continue;
      }
      const products = PRODUCTS_BY_TYPE[businessType] || [];
      for (let i = 0; i < targetPerType; i++) {
        const seller = sellers[randomBetween(0, sellers.length - 1)];
        let buyer = buyers[randomBetween(0, buyers.length - 1)];
        if (buyer.id === seller.id) {
          buyer = buyers.find((b) => b.id !== seller.id);
          if (!buyer) continue;
        }
        const productName = pick(products, i + seller.id);
        const demand = randomBetween(100, 5000);
        const value = demand * randomBetween(10, 200);
        const locationMatch = buyer.location === seller.location;

        const exists = await client.query(
          `SELECT 1 FROM msme_trade_relations WHERE buyer_msme_id = $1 AND seller_msme_id = $2 AND product_name = $3 LIMIT 1`,
          [buyer.id, seller.id, productName]
        );
        if (exists.rows.length > 0) continue;

        await client.query(
          `INSERT INTO msme_trade_relations (buyer_msme_id, seller_msme_id, product_name, estimated_monthly_demand, estimated_monthly_value, location_match)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [buyer.id, seller.id, productName, demand, value, locationMatch]
        );
        inserted++;
      }
    }

    console.log(`Inserted ${inserted} same-sector trade relations. Each business type should now have multiple wholesalers and buyers.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
