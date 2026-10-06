const path = require("path");
const express = require("express");
const { importBatch } = require("./importer");
const { toCsv } = require("./utils");
const {
  getDateBounds,
  getStores,
  getRevenueReport,
  getMissingDataReport,
  getReconciliationReport,
  getInvalidRecordsReport,
  getOrderDetails
} = require("./reports");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function parseReportQuery(req) {
  return {
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    store_id: req.query.store_id ? String(req.query.store_id) : undefined
  };
}

app.get("/api/meta", (req, res) => {
  res.json({
    date_bounds: getDateBounds(),
    stores: getStores()
  });
});

app.post("/api/import/:batch", (req, res) => {
  try {
    const batch = String(req.params.batch);
    const result = importBatch(batch);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

app.get("/api/reports/revenue", (req, res) => {
  try {
    const q = parseReportQuery(req);
    res.json(getRevenueReport(q.from, q.to, q.store_id));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/reports/missing-data", (req, res) => {
  try {
    const q = parseReportQuery(req);
    res.json(getMissingDataReport(q.from, q.to, q.store_id));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/reports/reconciliation", (req, res) => {
  try {
    const q = parseReportQuery(req);
    res.json(getReconciliationReport(q.from, q.to, q.store_id));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/reports/invalid-records", (req, res) => {
  try {
    const batch = req.query.batch ? String(req.query.batch) : undefined;
    res.json(getInvalidRecordsReport(batch));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/orders/:orderId", (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const details = getOrderDetails(orderId);
    if (!details.order && details.invalid_records.length === 0) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(details);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/exports/:type.csv", (req, res) => {
  try {
    const type = String(req.params.type);
    const q = parseReportQuery(req);

    if (type === "revenue") {
      const report = getRevenueReport(q.from, q.to, q.store_id);
      const rows = [...report.rows, { store_id: "TOTAL", date: "", ...report.total }];
      const csv = toCsv(rows, ["store_id", "date", "orders_count", "revenue"]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(csv);
      return;
    }

    if (type === "missing-data") {
      const report = getMissingDataReport(q.from, q.to, q.store_id);
      const csv = toCsv(report.rows, ["store_id", "date"]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(csv);
      return;
    }

    if (type === "reconciliation") {
      const report = getReconciliationReport(q.from, q.to, q.store_id);
      const csv = toCsv(report.rows, [
        "order_id",
        "store_id",
        "date",
        "total_amount",
        "recomputed_total",
        "diff_amount",
        "source_batch",
        "updated_at_utc"
      ]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(csv);
      return;
    }

    if (type === "invalid-records") {
      const report = getInvalidRecordsReport(req.query.batch ? String(req.query.batch) : undefined);
      const csv = toCsv(report.rows, [
        "id",
        "source_batch",
        "record_index",
        "order_id",
        "error_reason",
        "logged_at",
        "raw_payload"
      ]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(csv);
      return;
    }

    res.status(400).json({ error: "Unsupported export type" });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
