const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { db } = require("./db");
const {
  toVietnamDate,
  toIsoOrThrow,
  validateRequiredString,
  validateInteger,
  computeExpectedTotal,
  hashInvalidRecord
} = require("./utils");

const insertRunStmt = db.prepare(`
  INSERT INTO ingestion_runs (
    run_id, source_batch, started_at, status
  ) VALUES (?, ?, ?, 'running')
`);

const finishRunStmt = db.prepare(`
  UPDATE ingestion_runs
  SET finished_at = ?, total_records = ?, upserted_records = ?,
      skipped_older_records = ?, invalid_records = ?, status = ?
  WHERE run_id = ?
`);

const selectOrderStmt = db.prepare(`
  SELECT order_id, updated_at_utc
  FROM orders
  WHERE order_id = ?
`);

const upsertOrderStmt = db.prepare(`
  INSERT INTO orders (
    order_id, store_id, created_at_utc, updated_at_utc, created_at_vn_date,
    status, channel, discount_amount, total_amount, recomputed_total,
    reconcile_ok, items_json, source_batch, ingested_at
  ) VALUES (
    @order_id, @store_id, @created_at_utc, @updated_at_utc, @created_at_vn_date,
    @status, @channel, @discount_amount, @total_amount, @recomputed_total,
    @reconcile_ok, @items_json, @source_batch, @ingested_at
  )
  ON CONFLICT(order_id) DO UPDATE SET
    store_id = excluded.store_id,
    created_at_utc = excluded.created_at_utc,
    updated_at_utc = excluded.updated_at_utc,
    created_at_vn_date = excluded.created_at_vn_date,
    status = excluded.status,
    channel = excluded.channel,
    discount_amount = excluded.discount_amount,
    total_amount = excluded.total_amount,
    recomputed_total = excluded.recomputed_total,
    reconcile_ok = excluded.reconcile_ok,
    items_json = excluded.items_json,
    source_batch = excluded.source_batch,
    ingested_at = excluded.ingested_at
`);

const insertInvalidStmt = db.prepare(`
  INSERT OR IGNORE INTO invalid_records (
    record_hash, source_batch, record_index, order_id, raw_payload, error_reason, logged_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function resolveBatchFile(batchName) {
  const map = {
    batch_1: "batch_1.json",
    batch_2: "batch_2.json"
  };
  const file = map[batchName];
  if (!file) {
    throw new Error(`Unsupported batch name: ${batchName}`);
  }
  return path.join(__dirname, "..", "..", file);
}

function normalizeOrder(raw, sourceBatch) {
  const orderId = validateRequiredString(raw, "order_id");
  const storeId = validateRequiredString(raw, "store_id");
  const createdAtUtc = toIsoOrThrow(raw.created_at, "created_at");
  const updatedAtUtc = toIsoOrThrow(raw.updated_at, "updated_at");
  const status = validateRequiredString(raw, "status");
  if (status !== "completed" && status !== "cancelled") {
    throw new Error("status must be completed or cancelled");
  }
  if (!Array.isArray(raw.items)) {
    throw new Error("items must be an array");
  }
  validateInteger(raw.discount_amount, "discount_amount");
  validateInteger(raw.total_amount, "total_amount");
  const recomputed = computeExpectedTotal(raw);

  return {
    order_id: orderId,
    store_id: storeId,
    created_at_utc: createdAtUtc,
    updated_at_utc: updatedAtUtc,
    created_at_vn_date: toVietnamDate(createdAtUtc),
    status,
    channel: typeof raw.channel === "string" ? raw.channel : null,
    discount_amount: raw.discount_amount,
    total_amount: raw.total_amount,
    recomputed_total: recomputed,
    reconcile_ok: recomputed === raw.total_amount ? 1 : 0,
    items_json: JSON.stringify(raw.items),
    source_batch: sourceBatch,
    ingested_at: new Date().toISOString()
  };
}

function importBatch(batchName) {
  const sourceFile = resolveBatchFile(batchName);
  const content = fs.readFileSync(sourceFile, "utf8");
  const payload = JSON.parse(content);
  const orders = Array.isArray(payload) ? payload : payload && Array.isArray(payload.orders) ? payload.orders : null;
  if (!orders) {
    throw new Error(`File ${sourceFile} must contain an orders array`);
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  insertRunStmt.run(runId, batchName, startedAt);

  let upserted = 0;
  let skippedOlder = 0;
  let invalid = 0;

  const tx = db.transaction(() => {
    orders.forEach((record, idx) => {
      try {
        const normalized = normalizeOrder(record, batchName);
        const existing = selectOrderStmt.get(normalized.order_id);
        if (existing) {
          const existingUpdated = new Date(existing.updated_at_utc).getTime();
          const incomingUpdated = new Date(normalized.updated_at_utc).getTime();
          if (incomingUpdated < existingUpdated) {
            skippedOlder += 1;
            return;
          }
        }
        upsertOrderStmt.run(normalized);
        upserted += 1;
      } catch (err) {
        invalid += 1;
        const reason = err instanceof Error ? err.message : String(err);
        const recordHash = hashInvalidRecord(batchName, idx, record, reason);
        const orderId = record && typeof record.order_id === "string" ? record.order_id : null;
        insertInvalidStmt.run(
          recordHash,
          batchName,
          idx,
          orderId,
          JSON.stringify(record),
          reason,
          new Date().toISOString()
        );
      }
    });
  });

  try {
    tx();
    finishRunStmt.run(
      new Date().toISOString(),
      orders.length,
      upserted,
      skippedOlder,
      invalid,
      "success",
      runId
    );
  } catch (err) {
    finishRunStmt.run(
      new Date().toISOString(),
      orders.length,
      upserted,
      skippedOlder,
      invalid,
      "failed",
      runId
    );
    throw err;
  }

  return {
    run_id: runId,
    source_batch: batchName,
    total_records: orders.length,
    upserted_records: upserted,
    skipped_older_records: skippedOlder,
    invalid_records: invalid
  };
}

module.exports = { importBatch };
