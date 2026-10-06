# Phần 2 - Trả lời viết

## 1) Chống âm kho khi 2 yêu cầu đồng thời

Ví dụ SQL an toàn với PostgreSQL:

```sql
BEGIN;

UPDATE inventory
SET quantity = quantity - 8
WHERE sku = 'TRAN_CHAU'
  AND quantity >= 8;

-- kiểm tra có cập nhật đúng 1 dòng không
-- nếu 0 dòng: không đủ hàng, rollback

COMMIT;
```

Trong code, cần kiểm tra `row_count` (hoặc số dòng affected):
- `row_count = 1`: trừ kho thành công.
- `row_count = 0`: không đủ tồn, trả lỗi “insufficient stock”.

**Vì sao an toàn khi đồng thời:**
1. Điều kiện `quantity >= 8` được kiểm tra ngay trong câu `UPDATE` (atomic), không tách thành “SELECT rồi UPDATE”.
2. Hai request cùng lúc sẽ cạnh tranh lock trên cùng dòng tồn kho; DB đảm bảo tuần tự hóa cập nhật dòng đó.
3. Request đến sau chỉ trừ thành công nếu số lượng còn lại vẫn đủ điều kiện `>= 8`; nên tồn kho không thể âm.

## 2) POS chậm 15–20 phút nhưng báo cáo 7h luôn có số

Thiết kế đề xuất:

1. **Lịch chạy nền theo đợt (incremental backfill window):**
   - Chạy job từ đêm đến trước 7h sáng (ví dụ mỗi 10 phút).
   - Mỗi lần kéo lại cửa sổ 2–3 ngày gần nhất để bắt kịp đơn cập nhật muộn.

2. **Cơ chế upsert latest-wins theo `order_id` + `updated_at`:**
   - Đơn trùng `order_id` chỉ giữ bản mới nhất.
   - Chạy lại cùng dữ liệu không làm sai số (idempotent).

3. **Tách pipeline thành 3 bước độc lập:**
   - **Ingest:** gọi POS, lưu raw payload.
   - **Process:** validate + chuẩn hóa + ghi lỗi bản ghi hỏng.
   - **Serve:** materialize bảng/tập dữ liệu báo cáo để web đọc nhanh.

4. **Báo cáo không chờ lúc người dùng mở trang:**
   - Web chỉ đọc dữ liệu đã xử lý sẵn (precomputed aggregates / indexed query).
   - Nếu job đang chạy, vẫn hiển thị snapshot mới nhất + timestamp cập nhật cuối.

5. **Đảm bảo SLA 7h:**
   - Đặt deadline nội bộ (ví dụ 6:45 hoàn tất pipeline chính).
   - Nếu POS lỗi/chậm, fallback hiển thị snapshot gần nhất và cờ cảnh báo “data freshness”.
   - Có retry theo cấp số nhân + log + cảnh báo vận hành.

Với thiết kế này, người dùng mở báo cáo không phải đợi gọi POS realtime, và hệ thống vẫn ổn định ngay cả khi API POS chậm hoặc trả dữ liệu trễ.
