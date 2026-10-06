const crypto = require("crypto");

function toVietnamDate(isoUtc) {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) {
    throw new Error("created_at/update_at is not a valid ISO datetime");
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(d);
}

function toIsoOrThrow(value, fieldName) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${fieldName} is not a valid ISO datetime`);
  }
  return d.toISOString();
}

function validateRequiredString(record, field) {
  if (!record || typeof record[field] !== "string" || record[field].trim() === "") {
    throw new Error(`${field} is required and must be a non-empty string`);
  }
  return record[field];
}

function validateInteger(value, field) {
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`);
  }
  return value;
}

function computeExpectedTotal(order) {
  if (!Array.isArray(order.items)) {
    throw new Error("items must be an array");
  }

  const subtotal = order.items.reduce((sum, item, itemIndex) => {
    if (!item || typeof item !== "object") {
      throw new Error(`items[${itemIndex}] must be an object`);
    }
    const qty = validateInteger(item.qty, `items[${itemIndex}].qty`);
    const unitPrice = validateInteger(item.unit_price, `items[${itemIndex}].unit_price`);

    const toppingsCost = (item.toppings || []).reduce((ts, top, topIndex) => {
      if (!top || typeof top !== "object") {
        throw new Error(`items[${itemIndex}].toppings[${topIndex}] must be an object`);
      }
      const tQty = validateInteger(top.qty, `items[${itemIndex}].toppings[${topIndex}].qty`);
      const tUnit = validateInteger(top.unit_price, `items[${itemIndex}].toppings[${topIndex}].unit_price`);
      return ts + tQty * tUnit;
    }, 0);

    return sum + qty * (unitPrice + toppingsCost);
  }, 0);

  const discount = validateInteger(order.discount_amount, "discount_amount");
  return subtotal - discount;
}

function hashInvalidRecord(sourceBatch, index, payload, reason) {
  return crypto
    .createHash("sha1")
    .update(`${sourceBatch}|${index}|${JSON.stringify(payload)}|${reason}`)
    .digest("hex");
}

function toCsv(rows, headers) {
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
      return `"${s.replace(/"/g, "\"\"")}"`;
    }
    return s;
  };

  const lines = [];
  lines.push(headers.map((h) => escape(h)).join(","));
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function buildDateRange(from, to) {
  const parseYmd = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    return new Date(Date.UTC(y, m - 1, d));
  };

  const result = [];
  const start = parseYmd(from);
  const end = parseYmd(to);

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid date range");
  }
  if (start > end) {
    throw new Error("from date must be <= to date");
  }

  const cur = new Date(start);
  while (cur <= end) {
    const year = cur.getUTCFullYear();
    const month = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const day = String(cur.getUTCDate()).padStart(2, "0");
    result.push(`${year}-${month}-${day}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return result;
}

module.exports = {
  toVietnamDate,
  toIsoOrThrow,
  validateRequiredString,
  validateInteger,
  computeExpectedTotal,
  hashInvalidRecord,
  toCsv,
  buildDateRange
};
