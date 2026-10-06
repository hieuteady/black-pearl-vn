# Black Pearl VN - POS Revenue Dashboard

Ứng dụng báo cáo doanh thu POS cho bài test Black Pearl:
- Import dữ liệu từ `batch_1.json`, `batch_2.json`
- Xử lý idempotent + latest-wins theo `updated_at`
- Dashboard web + biểu đồ + export CSV
- Có thể chạy local bằng 1 lệnh Docker

---

## 1) Cấu trúc dự án

```text
black-pearl-vn/
├── batch_1.json
├── batch_2.json
├── docker-compose.yml
├── start-local.sh
├── web/
│   ├── Dockerfile
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   ├── docs/
│   │   └── part2.md
│   ├── public/
│   │   ├── index.html
│   │   ├── app.js
│   │   └── styles.css
│   └── src/
│       ├── server.js
│       ├── bootstrap-and-start.js
│       ├── importer.js
│       ├── reports.js
│       ├── db.js
│       ├── utils.js
│       └── cli-import.js
└── README.md
```

---

## 2) Chạy local bằng 1 lệnh (khuyến nghị)

Yêu cầu: cài Docker Desktop (hoặc Docker Engine + Compose plugin).

### Linux / macOS

```bash
git clone <repo-url>
cd black-pearl-vn
./start-local.sh
```

### Windows (PowerShell)

```powershell
git clone <repo-url>
cd black-pearl-vn
docker compose up --build
```

Sau khi chạy xong, truy cập:

`http://localhost:3000`

Ghi chú:
- Lần chạy đầu, app tự import `batch_1` + `batch_2` nếu DB trống.
- Dữ liệu SQLite được giữ bằng Docker volume `web_db_data`.

---

## 3) Chạy local bằng Node.js (không dùng Docker)

Yêu cầu: Node.js 20+.

### Linux / macOS

```bash
cd web
npm install
npm run dev
```

### Windows (PowerShell)

```powershell
cd web
npm install
npm run dev
```

Mở:

`http://localhost:3000`

---

## 4) Tính năng chính

1. **Import dữ liệu batch**
   - Import `batch_1`, `batch_2` qua UI hoặc API/CLI.
   - Hỗ trợ payload JSON có `orders: []`.

2. **Idempotent + latest-wins**
   - `order_id` là khóa duy nhất.
   - Nếu đơn trùng nhiều lần, giữ bản có `updated_at` mới nhất.

3. **Xử lý lỗi không dừng luồng**
   - Record hỏng/sai định dạng được ghi vào `invalid_records` kèm lý do.
   - Import không dừng vì record lỗi.

4. **Đối soát công thức total_amount**
   - Tính lại `recomputed_total`.
   - Gắn cờ lệch `reconcile_ok = false`.

5. **Báo cáo theo ngày Việt Nam (UTC+7)**
   - Doanh thu + số đơn completed theo cửa hàng × ngày.
   - Cảnh báo thiếu dữ liệu.
   - Danh sách đơn sai đối soát.
   - Danh sách bản ghi bị loại.

6. **Dashboard UI**
   - Bộ lọc theo ngày/cửa hàng.
   - KPI cards + biểu đồ doanh thu.
   - Bảng responsive, hỗ trợ scroll ngang trên mobile.
   - Click `order_id` mở popup chi tiết đơn.
   - Notify trạng thái thao tác (góc phải trên).

7. **Export CSV**
   - Export cho từng loại báo cáo.

---

## 5) Danh sách API

### Metadata

- `GET /api/meta`
  - Trả về `date_bounds` và danh sách `stores`.

### Import

- `POST /api/import/batch_1`
- `POST /api/import/batch_2`

### Reports JSON

- `GET /api/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD&store_id=CH01`
- `GET /api/reports/missing-data?from=YYYY-MM-DD&to=YYYY-MM-DD&store_id=CH01`
- `GET /api/reports/reconciliation?from=YYYY-MM-DD&to=YYYY-MM-DD&store_id=CH01`
- `GET /api/reports/invalid-records?batch=batch_1`

### Order details

- `GET /api/orders/:orderId`
  - Trả chi tiết đơn + các invalid record liên quan cùng `order_id` (nếu có).

### Export CSV

- `GET /api/exports/revenue.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&store_id=CH01`
- `GET /api/exports/missing-data.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&store_id=CH01`
- `GET /api/exports/reconciliation.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&store_id=CH01`
- `GET /api/exports/invalid-records.csv?batch=batch_1`

---

## 6) Scripts hữu ích

Trong thư mục `web/`:

- `npm run dev` - chạy server local
- `npm run start` - chạy server production mode
- `npm run start:bootstrap` - chạy server + tự import batch khi DB trống
- `npm run import:batch1` - import batch_1 qua CLI
- `npm run import:batch2` - import batch_2 qua CLI

---

## 7) Deploy demo

App đã deploy public tại:

`https://black-pearl-vn.onrender.com/`
