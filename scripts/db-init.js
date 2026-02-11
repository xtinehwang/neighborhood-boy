const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const sqlPath = path.join(process.cwd(), 'supabase', 'setup.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Database init failed: DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

pool
  .query(sql)
  .then(() => {
    console.log('Database init complete.');
  })
  .catch((err) => {
    console.error('Database init failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
