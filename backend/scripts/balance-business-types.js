/**
 * Rebalance msme_master so each business_type has (roughly) equal count.
 * Updates business_type and email (contact{id}@msme{type}.in). No deletes.
 * Run from backend: node scripts/balance-business-types.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const BUSINESS_TYPES = ['fmcg', 'clothing', 'electronic', 'supermarket'];

async function run() {
  const client = await pool.connect();
  try {
    const totalRes = await client.query('SELECT COUNT(*) AS c FROM msme_master');
    const total = parseInt(totalRes.rows[0].c, 10);
    if (total === 0) {
      console.log('No companies in msme_master.');
      return;
    }

    const targetPerType = Math.floor(total / BUSINESS_TYPES.length);
    console.log(`Total companies: ${total}. Target per type: ${targetPerType}`);

    const countsRes = await client.query(
      `SELECT business_type, COUNT(*) AS c, array_agg(id ORDER BY id) AS ids
       FROM msme_master
       WHERE business_type = ANY($1::text[])
       GROUP BY business_type`,
      [BUSINESS_TYPES]
    );
    const byType = {};
    for (const row of countsRes.rows) {
      byType[row.business_type] = { count: parseInt(row.c, 10), ids: row.ids || [] };
    }
    for (const t of BUSINESS_TYPES) {
      if (!byType[t]) byType[t] = { count: 0, ids: [] };
    }

    const idsToReassign = [];
    const needByType = {};
    for (const t of BUSINESS_TYPES) {
      needByType[t] = targetPerType - (byType[t].count || 0);
      const surplus = (byType[t].count || 0) - targetPerType;
      if (surplus > 0) idsToReassign.push(...byType[t].ids.slice(-surplus));
    }

    const typesNeeding = BUSINESS_TYPES.filter((t) => needByType[t] > 0);
    let typeIndex = 0;
    let updated = 0;
    for (const id of idsToReassign) {
      if (typeIndex >= typesNeeding.length) break;
      const newType = typesNeeding[typeIndex];
      const email = `contact${id}@msme${newType}.in`;
      await client.query(
        'UPDATE msme_master SET business_type = $1, email = $2 WHERE id = $3',
        [newType, email, id]
      );
      updated++;
      needByType[newType]--;
      if (needByType[newType] <= 0) typeIndex++;
    }

    const afterRes = await client.query(
      `SELECT business_type, COUNT(*) AS c FROM msme_master WHERE business_type = ANY($1::text[]) GROUP BY business_type`,
      [BUSINESS_TYPES]
    );
    console.log('Updated', updated, 'companies.');
    console.log('Counts after balance:');
    for (const row of afterRes.rows) {
      console.log('  ', row.business_type, ':', row.c);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
