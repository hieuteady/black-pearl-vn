const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "app.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  created_at_vn_date TEXT NOT NULL,
  status TEXT NOT NULL,
  channel TEXT,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL,
  recomputed_total INTEGER NOT NULL,
  reconcile_ok INTEGER NOT NULL,
  items_json TEXT NOT NULL,
  source_batch TEXT NOT NULL,
  ingested_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invalid_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_hash TEXT NOT NULL UNIQUE,
  source_batch TEXT NOT NULL,
  record_index INTEGER NOT NULL,
  order_id TEXT,
  raw_payload TEXT NOT NULL,
  error_reason TEXT NOT NULL,
  logged_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  run_id TEXT PRIMARY KEY,
  source_batch TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  total_records INTEGER NOT NULL DEFAULT 0,
  upserted_records INTEGER NOT NULL DEFAULT 0,
  skipped_older_records INTEGER NOT NULL DEFAULT 0,
  invalid_records INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_store_date
  ON orders (store_id, created_at_vn_date);

CREATE INDEX IF NOT EXISTS idx_orders_date
  ON orders (created_at_vn_date);
`);

module.exports = { db };
