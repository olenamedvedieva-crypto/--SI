const { Pool } = require('pg');

// Railway automatically injects DATABASE_URL when you attach a Postgres
// plugin to this service. Locally, put the same variable in a .env file
// (see .env.example) and load it with `node --env-file=.env server/index.js`
// or the `dotenv` package if you prefer.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS reviews (
  id                 SERIAL PRIMARY KEY,
  check_date         DATE,
  check_time         TEXT,
  order_id           TEXT,
  country            TEXT,
  city               TEXT,
  location           TEXT,
  channel            TEXT,
  delivery_type      TEXT,
  guest_name         TEXT,
  b1                 NUMERIC,
  b2                 NUMERIC,
  b3                 NUMERIC,
  b4                 NUMERIC,
  nps                INTEGER,
  b1_comment         TEXT,
  b2_comment         TEXT,
  b3_comment         TEXT,
  b4_comment         TEXT,
  b2_named           TEXT,
  b2_offered_check   TEXT,
  b2_clarified       TEXT,
  b3_all_items       TEXT,
  b4_receipt_given   TEXT,
  b4_change_given    TEXT,
  liked              TEXT,
  disliked           TEXT,
  recommendations    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function initDb() {
  await pool.query(CREATE_TABLE_SQL);
  console.log('[db] reviews table ready');
}

module.exports = { pool, initDb };
