const fromDateEl = document.getElementById("from-date");
const toDateEl = document.getElementById("to-date");
const storeSelectEl = document.getElementById("store-select");
const importResultEl = document.getElementById("import-result");
const statRevenueEl = document.getElementById("stat-revenue");
const statOrdersEl = document.getElementById("stat-orders");
const statReconEl = document.getElementById("stat-recon");
const statMissingEl = document.getElementById("stat-missing");
const actionStatusEl = document.getElementById("action-status");
const revenueEmptyEl = document.getElementById("revenue-empty");
const missingEmptyEl = document.getElementById("missing-empty");
const reconciliationEmptyEl = document.getElementById("reconciliation-empty");
const invalidEmptyEl = document.getElementById("invalid-empty");

let dailyRevenueChart;
let storeRevenueChart;
const modalEl = document.getElementById("order-modal");
const modalBackdropEl = document.getElementById("order-modal-backdrop");
const modalCloseEl = document.getElementById("order-modal-close");
const modalTitleEl = document.getElementById("order-modal-title");
const modalBodyEl = document.getElementById("order-modal-body");

function money(v) {
  return Number(v || 0).toLocaleString("vi-VN");
}

function formatDisplayDate(value) {
  if (!value) return "";

  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (ymd) {
    return `${ymd[3]}-${ymd[2]}-${ymd[1]}`;
  }

  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const year = d.getUTCFullYear();
    return `${day}-${month}-${year}`;
  }

  return String(value);
}

function buildQuery() {
  const params = new URLSearchParams();
  const from = String(fromDateEl.value || "").trim();
  const to = String(toDateEl.value || "").trim();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (storeSelectEl.value) params.set("store_id", storeSelectEl.value);
  return params.toString();
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text();
  let data = null;

  if (contentType.includes("application/json")) {
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (err) {
      throw new Error("API trả JSON không hợp lệ.");
    }
  }

  if (!res.ok) {
    if (data && data.error) {
      throw new Error(data.error);
    }
    throw new Error(rawText || `Request failed (${res.status})`);
  }

  if (!data) {
    throw new Error("API không trả về JSON.");
  }
  return data;
}

function setExportLinks() {
  const q = buildQuery();
  const suffix = q ? `?${q}` : "";
  document.getElementById("export-revenue").href = `/api/exports/revenue.csv${suffix}`;
  document.getElementById("export-missing").href = `/api/exports/missing-data.csv${suffix}`;
  document.getElementById("export-reconciliation").href = `/api/exports/reconciliation.csv${suffix}`;
  document.getElementById("export-invalid").href = "/api/exports/invalid-records.csv";
}

async function loadMeta() {
  const meta = await fetchJson("/api/meta");
  const { date_bounds: bounds, stores } = meta;
  const currentStore = storeSelectEl.value;

  storeSelectEl.innerHTML = `<option value="">Tất cả</option>`;
  for (const store of stores) {
    const option = document.createElement("option");
    option.value = store;
    option.textContent = store;
    storeSelectEl.appendChild(option);
  }
  if (currentStore && stores.includes(currentStore)) {
    storeSelectEl.value = currentStore;
  }

  if (bounds?.min_date && !fromDateEl.value) {
    fromDateEl.value = bounds.min_date;
  }
  if (bounds?.max_date && !toDateEl.value) {
    toDateEl.value = bounds.max_date;
  }
  setExportLinks();
}

function renderRevenue(data) {
  const tbody = document.querySelector("#revenue-table tbody");
  const tfoot = document.querySelector("#revenue-table tfoot");
  tbody.innerHTML = "";
  tfoot.innerHTML = "";

  for (const row of data.rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDisplayDate(row.date)}</td>
      <td>${row.store_id}</td>
      <td>${row.orders_count}</td>
      <td>${money(row.revenue)}</td>
    `;
    tbody.appendChild(tr);
  }

  const total = document.createElement("tr");
  total.innerHTML = `
    <td colspan="2">TỔNG</td>
    <td>${data.total.orders_count}</td>
    <td>${money(data.total.revenue)}</td>
  `;
  tfoot.appendChild(total);
  setTableNote(
    revenueEmptyEl,
    data.rows.length === 0,
    "Không có dữ liệu doanh thu cho bộ lọc hiện tại."
  );
}

function renderMissing(data) {
  const tbody = document.querySelector("#missing-table tbody");
  tbody.innerHTML = "";
  for (const row of data.rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDisplayDate(row.date)}</td>
      <td>${row.store_id}</td>
    `;
    tbody.appendChild(tr);
  }
  setTableNote(
    missingEmptyEl,
    data.rows.length === 0,
    "Không phát hiện thiếu dữ liệu theo bộ lọc hiện tại."
  );
}

function renderReconciliation(data) {
  const tbody = document.querySelector("#reconciliation-table tbody");
  tbody.innerHTML = "";
  for (const row of data.rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <button class="order-link js-order-link" data-order-id="${row.order_id}">
          ${row.order_id}
        </button>
      </td>
      <td>${formatDisplayDate(row.date)}</td>
      <td>${row.store_id}</td>
      <td>${money(row.total_amount)}</td>
      <td>${money(row.recomputed_total)}</td>
      <td>${money(row.diff_amount)}</td>
    `;
    tbody.appendChild(tr);
  }
  setTableNote(
    reconciliationEmptyEl,
    data.rows.length === 0,
    "Không có đơn lệch đối soát trong phạm vi lọc hiện tại."
  );
}

function renderInvalid(data) {
  const tbody = document.querySelector("#invalid-table tbody");
  tbody.innerHTML = "";
  for (const row of data.rows) {
    const orderIdCell = row.order_id
      ? `<button class="order-link js-order-link" data-order-id="${row.order_id}">${row.order_id}</button>`
      : "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${row.source_batch}</td>
      <td>${row.record_index}</td>
      <td>${orderIdCell}</td>
      <td>${row.error_reason}</td>
    `;
    tbody.appendChild(tr);
  }
  setTableNote(
    invalidEmptyEl,
    data.rows.length === 0,
    "Không có bản ghi bị loại."
  );
}

function setTableNote(element, show, message) {
  if (!element) return;
  if (!show) {
    element.classList.add("hidden");
    element.textContent = "";
    return;
  }
  element.textContent = message;
  element.classList.remove("hidden");
}

function openModal(title, content) {
  modalTitleEl.textContent = title;
  modalBodyEl.textContent = content;
  modalEl.classList.remove("hidden");
}

function closeModal() {
  modalEl.classList.add("hidden");
}

function formatOrderDetailPayload(payload) {
  const sections = [];
  if (payload.order) {
    sections.push("ORDER (hợp lệ trong bảng orders):");
    sections.push(JSON.stringify(payload.order, null, 2));
  } else {
    sections.push("ORDER: không có trong bảng orders (có thể bị loại khi import).");
  }

  if (payload.invalid_records && payload.invalid_records.length > 0) {
    sections.push("");
    sections.push("INVALID RECORDS LIÊN QUAN:");
    sections.push(JSON.stringify(payload.invalid_records, null, 2));
  }

  return sections.join("\n");
}

async function onOrderLinkClick(event) {
  const target = event.target.closest(".js-order-link");
  if (!target) return;

  const orderId = target.getAttribute("data-order-id");
  if (!orderId) return;

  openModal(`Đang tải ${orderId}...`, "");
  try {
    const detail = await fetchJson(`/api/orders/${encodeURIComponent(orderId)}`);
    openModal(`Chi tiết đơn hàng: ${orderId}`, formatOrderDetailPayload(detail));
  } catch (err) {
    openModal(`Chi tiết đơn hàng: ${orderId}`, err instanceof Error ? err.message : String(err));
  }
}

function renderSummaryStats(revenue, missing, recon) {
  statRevenueEl.textContent = `${money(revenue.total.revenue)} đ`;
  statOrdersEl.textContent = money(revenue.total.orders_count);
  statReconEl.textContent = money(recon.rows.length);
  statMissingEl.textContent = money(missing.rows.length);
}

function buildChartData(revenueRows) {
  const byDate = new Map();
  const byStore = new Map();

  for (const row of revenueRows) {
    byDate.set(row.date, (byDate.get(row.date) || 0) + Number(row.revenue || 0));
    byStore.set(row.store_id, (byStore.get(row.store_id) || 0) + Number(row.revenue || 0));
  }

  const dailyLabelsRaw = [...byDate.keys()].sort();
  const dailyLabels = dailyLabelsRaw.map((d) => formatDisplayDate(d));
  const dailyValues = dailyLabelsRaw.map((date) => byDate.get(date));
  const storeLabels = [...byStore.keys()].sort();
  const storeValues = storeLabels.map((store) => byStore.get(store));

  return { dailyLabels, dailyValues, storeLabels, storeValues };
}

function renderCharts(revenueRows) {
  const { dailyLabels, dailyValues, storeLabels, storeValues } = buildChartData(revenueRows);

  if (dailyRevenueChart) {
    dailyRevenueChart.destroy();
  }
  if (storeRevenueChart) {
    storeRevenueChart.destroy();
  }

  dailyRevenueChart = new Chart(document.getElementById("dailyRevenueChart"), {
    type: "line",
    data: {
      labels: dailyLabels,
      datasets: [
        {
          label: "Doanh thu",
          data: dailyValues,
          tension: 0.3,
          borderColor: "#2563eb",
          pointBackgroundColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.15)",
          fill: true
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true }
      },
      scales: {
        y: {
          ticks: {
            callback: (value) => money(value)
          }
        }
      }
    }
  });

  storeRevenueChart = new Chart(document.getElementById("storeRevenueChart"), {
    type: "bar",
    data: {
      labels: storeLabels,
      datasets: [
        {
          label: "Doanh thu",
          data: storeValues,
          borderWidth: 1,
          backgroundColor: ["#2563eb", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444"]
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          ticks: {
            callback: (value) => money(value)
          }
        }
      }
    }
  });
}

async function loadReports() {
  const q = buildQuery();
  const suffix = q ? `?${q}` : "";

  const [revenue, missing, recon, invalid] = await Promise.all([
    fetchJson(`/api/reports/revenue${suffix}`),
    fetchJson(`/api/reports/missing-data${suffix}`),
    fetchJson(`/api/reports/reconciliation${suffix}`),
    fetchJson("/api/reports/invalid-records")
  ]);

  renderRevenue(revenue);
  renderMissing(missing);
  renderReconciliation(recon);
  renderInvalid(invalid);
  renderSummaryStats(revenue, missing, recon);
  renderCharts(revenue.rows);
  setExportLinks();
}

function showUiError(err) {
  importResultEl.textContent = err instanceof Error ? err.message : String(err);
}

let actionStatusTimer;
function setActionStatus(type, message, autoHideMs = 2500) {
  if (!actionStatusEl) return;
  if (actionStatusTimer) {
    clearTimeout(actionStatusTimer);
    actionStatusTimer = null;
  }

  actionStatusEl.className = `action-status ${type}`;
  actionStatusEl.textContent = message;

  if (autoHideMs > 0 && type !== "loading") {
    actionStatusTimer = setTimeout(() => {
      actionStatusEl.className = "action-status hidden";
      actionStatusEl.textContent = "";
    }, autoHideMs);
  }
}

async function importBatch(batchName) {
  importResultEl.textContent = `Đang import ${batchName}...`;
  try {
    const result = await fetchJson(`/api/import/${batchName}`, { method: "POST" });
    importResultEl.textContent = JSON.stringify(result, null, 2);
    await loadMeta();
    await loadReports();
  } catch (err) {
    importResultEl.textContent = err instanceof Error ? err.message : String(err);
  }
}

document.getElementById("import-batch1").addEventListener("click", () => importBatch("batch_1"));
document.getElementById("import-batch2").addEventListener("click", () => importBatch("batch_2"));
document.getElementById("reload-meta").addEventListener("click", async () => {
  try {
    await loadMeta();
    await loadReports();
    setActionStatus("success", "Reload metadata thành công.");
  } catch (err) {
    showUiError(err);
    setActionStatus("error", err instanceof Error ? err.message : String(err), 4000);
  }
});
document.getElementById("refresh-reports").addEventListener("click", async () => {
  try {
    await loadReports();
    setActionStatus("success", "Lấy báo cáo thành công.");
  } catch (err) {
    showUiError(err);
    setActionStatus("error", err instanceof Error ? err.message : String(err), 4000);
  }
});
document.addEventListener("click", onOrderLinkClick);
modalCloseEl.addEventListener("click", closeModal);
modalBackdropEl.addEventListener("click", closeModal);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

Promise.resolve()
  .then(loadMeta)
  .then(loadReports)
  .catch((err) => {
      showUiError(err);
  });
