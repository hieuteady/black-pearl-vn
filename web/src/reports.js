const { db } = require("./db");
const { buildDateRange } = require("./utils");

function getDateBounds() {
  return db
    .prepare(
      `
      SELECT
        MIN(created_at_vn_date) AS min_date,
        MAX(created_at_vn_date) AS max_date
      FROM orders
    `
    )
    .get();
}

function getStores() {
  return db
    .prepare(
      `
      SELECT DISTINCT store_id
      FROM orders
      ORDER BY store_id
    `
    )
    .all()
    .map((r) => r.store_id);
}

function resolveRange(from, to) {
  const bounds = getDateBounds();
  if (!bounds.min_date || !bounds.max_date) {
    return { from: from || null, to: to || null };
  }
  return {
    from: from || bounds.min_date,
    to: to || bounds.max_date
  };
}

function getRevenueReport(from, to, storeId) {
  const range = resolveRange(from, to);
  if (!range.from || !range.to) {
    return { from: null, to: null, rows: [], total: { orders_count: 0, revenue: 0 } };
  }

  const params = { from: range.from, to: range.to };
  const storeCondition = storeId ? " AND store_id = @storeId " : "";
  if (storeId) {
    params.storeId = storeId;
  }

  const rows = db
    .prepare(
      `
      SELECT
        store_id,
        created_at_vn_date AS date,
        COUNT(*) AS orders_count,
        SUM(total_amount) AS revenue
      FROM orders
      WHERE status = 'completed'
        AND created_at_vn_date BETWEEN @from AND @to
        ${storeCondition}
      GROUP BY store_id, created_at_vn_date
      ORDER BY created_at_vn_date, store_id
    `
    )
    .all(params);

  const total = rows.reduce(
    (acc, row) => {
      acc.orders_count += row.orders_count || 0;
      acc.revenue += row.revenue || 0;
      return acc;
    },
    { orders_count: 0, revenue: 0 }
  );

  return { from: range.from, to: range.to, rows, total };
}

function getMissingDataReport(from, to, storeId) {
  const range = resolveRange(from, to);
  if (!range.from || !range.to) {
    return { from: null, to: null, rows: [] };
  }

  const stores = storeId ? [storeId] : getStores();
  const dates = buildDateRange(range.from, range.to);
  const result = [];

  const hasAnyOrderStmt = db.prepare(
    `
    SELECT 1
    FROM orders
    WHERE store_id = ?
      AND created_at_vn_date = ?
    LIMIT 1
  `
  );

  for (const store of stores) {
    for (const date of dates) {
      const hasOrder = hasAnyOrderStmt.get(store, date);
      if (!hasOrder) {
        result.push({ store_id: store, date });
      }
    }
  }

  return { from: range.from, to: range.to, rows: result };
}

function getReconciliationReport(from, to, storeId) {
  const range = resolveRange(from, to);
  if (!range.from || !range.to) {
    return { from: null, to: null, rows: [] };
  }

  const params = { from: range.from, to: range.to };
  const storeCondition = storeId ? " AND store_id = @storeId " : "";
  if (storeId) {
    params.storeId = storeId;
  }

  const rows = db
    .prepare(
      `
      SELECT
        order_id,
        store_id,
        created_at_vn_date AS date,
        total_amount,
        recomputed_total,
        (total_amount - recomputed_total) AS diff_amount,
        source_batch,
        updated_at_utc
      FROM orders
      WHERE reconcile_ok = 0
        AND created_at_vn_date BETWEEN @from AND @to
        ${storeCondition}
      ORDER BY created_at_vn_date, store_id, order_id
    `
    )
    .all(params);

  return { from: range.from, to: range.to, rows };
}

function getInvalidRecordsReport(sourceBatch) {
  const params = {};
  const condition = sourceBatch ? "WHERE source_batch = @sourceBatch" : "";
  if (sourceBatch) {
    params.sourceBatch = sourceBatch;
  }
  const rows = db
    .prepare(
      `
      SELECT
        id,
        source_batch,
        record_index,
        order_id,
        error_reason,
        logged_at,
        raw_payload
      FROM invalid_records
      ${condition}
      ORDER BY id DESC
    `
    )
    .all(params);
  return { rows };
}

function getOrderDetails(orderId) {
  const orderRow = db
    .prepare(
      `
      SELECT
        order_id,
        store_id,
        created_at_utc,
        updated_at_utc,
        created_at_vn_date,
        status,
        channel,
        discount_amount,
        total_amount,
        recomputed_total,
        reconcile_ok,
        source_batch,
        ingested_at,
        items_json
      FROM orders
      WHERE order_id = ?
      LIMIT 1
    `
    )
    .get(orderId);

  const invalidRows = db
    .prepare(
      `
      SELECT
        id,
        source_batch,
        record_index,
        order_id,
        error_reason,
        logged_at,
        raw_payload
      FROM invalid_records
      WHERE order_id = ?
      ORDER BY id DESC
    `
    )
    .all(orderId);

  const order = orderRow
    ? {
        ...orderRow,
        items: JSON.parse(orderRow.items_json)
      }
    : null;

  if (order) {
    delete order.items_json;
  }

  return { order, invalid_records: invalidRows };
}

module.exports = {
  getDateBounds,
  getStores,
  getRevenueReport,
  getMissingDataReport,
  getReconciliationReport,
  getInvalidRecordsReport,
  getOrderDetails
};
