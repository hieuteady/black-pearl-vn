const { importBatch } = require("./importer");

function main() {
  const batchName = process.argv[2];
  if (!batchName) {
    console.error("Usage: node src/cli-import.js <batch_1|batch_2>");
    process.exit(1);
  }

  try {
    const result = importBatch(batchName);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
