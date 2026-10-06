const { db } = require("./db");
const { importBatch } = require("./importer");

function shouldAutoImport() {
  const value = (process.env.AUTO_IMPORT || "true").toLowerCase().trim();
  return value !== "false" && value !== "0" && value !== "no";
}

function getOrderCount() {
  const row = db.prepare("SELECT COUNT(*) AS count FROM orders").get();
  return row ? Number(row.count || 0) : 0;
}

function bootstrapDataIfNeeded() {
  if (!shouldAutoImport()) {
    return;
  }

  const count = getOrderCount();
  if (count > 0) {
    return;
  }

  console.log("Bootstrapping data: importing batch_1 and batch_2...");
  importBatch("batch_1");
  importBatch("batch_2");
  console.log("Bootstrap import completed.");
}

function main() {
  bootstrapDataIfNeeded();
  require("./server");
}

main();
