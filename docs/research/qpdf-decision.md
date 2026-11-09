# Quyết định T028: thư viện mật khẩu và nén PDF trong trình duyệt

Ngày: 2026-11-09. Trạng thái: **chọn `@neslinesli93/qpdf-wasm`**.

## Vấn đề
`pdf-lib` không mã hóa/giải mã PDF. Cần thư viện chạy hoàn toàn trong trình duyệt (constitution I) cho `protect`, `unlock` và `compress`.

## Phương án đã xem
| Gói | Giấy phép | Kích thước | Nhận xét |
|---|---|---|---|
| `@neslinesli93/qpdf-wasm` 0.3.1 | ISC | 1,3 MB wasm | qpdf thật biên dịch sang wasm, API `callMain` như CLI, bảo trì gần đây |
| `@jspawn/qpdf-wasm` 0.0.2 | Apache-2.0 | 1,3 MB | bản cũ, ít cập nhật |
| `qpdf-wasm` 0.1.0 | Apache-2.0 | 2,3 MB | lớn hơn, không có lợi thế |

## Đo trên Node (cùng wasm sẽ chạy trong worker)
- Mã hóa AES-256 (`--encrypt --user-password --owner-password --bits=256`): thành công; `pdf-lib` mở file này báo `encrypted`, đúng như mong đợi.
- Mật khẩu sai khi giải mã: mã thoát 2, thông báo `invalid password`, **không tạo file** (đúng kịch bản US3.2).
- Giải mã với mật khẩu đúng: thành công.
- Nén chỉ tối ưu cấu trúc (`--object-streams=generate --recompress-flate --compression-level=9`) trên PDF 50 trang nặng chữ, chưa nén: **117 031 → 57 504 byte (giảm 50,9%) trong 36 ms**.
- Trên file mẫu rất nhỏ, nén có thể làm file **lớn hơn** (2 778 → 2 814 byte). Vì vậy công cụ so sánh trước/sau và báo "không giảm thêm được" thay vì xuất file lớn hơn (spec FR-006).
- Khởi tạo wasm: 11 ms. wasm nằm ở chunk riêng, chỉ tải khi chạy công cụ (constitution IV).

## Bộ nhớ khi gộp file lớn (phần Phase 0 còn lại)
Gộp 2 PDF 1 500 trang (3 000 trang) bằng `pdf-lib`: 0,95 s, bộ nhớ tăng ~29 MB. Giới hạn thực tế do kích thước byte; giữ cảnh báo trên 100 MB (spec, mục Edge Cases) và xử lý trong Worker có thể hủy.

## Hệ quả
- Thêm `src/lib/qpdf.ts` bọc qpdf (nạp lười, mỗi lần chạy một instance, thư mục ảo riêng).
- Kiểm thử trên Node cần truyền `wasmBinary`; trên trình duyệt dùng URL từ `?url`.
- Mật khẩu không bao giờ được ghi nhật ký; truyền vào qpdf qua tham số `--password=` trong worker.
