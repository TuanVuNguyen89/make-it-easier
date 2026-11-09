# Phân tích nghiệp vụ Files Editor (nguồn cảm hứng)

Khảo sát ngày 2026-11-09, quan sát giao diện bằng Chrome ở vai trò người dùng bình thường.
Mục đích: hiểu **nghiệp vụ** để tự xây một sản phẩm cá nhân. Không sao chép mã nguồn, branding hay tài sản của site gốc.

> Giới hạn: `curl` bị Cloudflare challenge chặn (403), không vượt bot-protection. Không đọc được logic server.
> Chưa kiểm chứng việc xử lý file chạy ở client hay server (công cụ `javascript_tool` bị chặn ở trang này). Giả định được ghi ở `plan.md`.

## 1. Cấu trúc ứng dụng (route quan sát được)

| Route | Chức năng |
|---|---|
| `/app/documents/all` | Thư viện tài liệu, tab Tất cả |
| `/app/documents/recent` | Gần đây |
| `/app/documents/favourites` | Yêu thích |
| `/app/tools/pdf-tools/all` | Danh mục công cụ PDF, có tab lọc |

Sidebar: **Tài liệu** (Các tập tin của tôi, Gần đây, Yêu thích, Đã xóa), **Hình ảnh**, **Công cụ** (Công cụ PDF, Công cụ hình ảnh), **Chữ ký** (sắp ra), **Không gian làm việc** (Beta), **Biểu mẫu có thể điền** (sắp ra).
Topbar: ô tìm kiếm thư mục/tập tin, trợ giúp, menu tài khoản.

## 2. Quản lý tài liệu

- Nút **Tải lên** và **Thư mục mới**.
- Bảng: cột Tên, Lần sửa đổi cuối cùng, Hoạt động; chọn nhiều dòng bằng checkbox.
- Sắp xếp theo "Đã sửa đổi".
- Trạng thái rỗng: "Bạn chưa thêm bất kỳ tài liệu nào".
- Có thùng rác (Đã xóa) và yêu thích.

## 3. Danh mục công cụ PDF (nhóm theo tab)

**Biên tập**
- Chú thích PDF (viết, vẽ, tô sáng, hình dạng)
- Chỉnh sửa PDF
- Ký PDF (chữ ký, chữ viết tắt, ngày, hộp kiểm)
- Biên tập/Redact (xóa vĩnh viễn thông tin nhạy cảm)
- OCR

**Tổ chức**
- Tổ chức trang (sắp xếp, xóa, thêm)
- Xóa trang
- Xoay trang
- Sửa PDF hỏng
- Số trang (vị trí, kích thước, phông)
- Thêm hình mờ
- Trích xuất trang
- Hợp nhất
- Tách
- Nén
- Cắt trang (crop)
- Bảo vệ bằng mật khẩu
- Mở khóa

**Chuyển đổi từ PDF**: DOCX, PNG, JPG, XLSX, PPTX.
**Chuyển đổi sang PDF**: DOCX, PNG, JPG, XLSX, PPTX, TXT.

## 4. Luồng người dùng chung của một công cụ (suy ra, chưa tự thử đầy đủ)

1. Chọn công cụ từ danh mục (hoặc từ một tài liệu trong thư viện).
2. Chọn/tải file (hoặc file có sẵn trong thư viện).
3. Cấu hình tham số (trang nào, mật khẩu, mức nén…).
4. Xử lý, hiển thị tiến trình.
5. Tải kết quả hoặc lưu vào thư viện.

## 5. Phân loại độ khó để lập kế hoạch

| Mức | Công cụ | Cách làm khả thi |
|---|---|---|
| Dễ (thao tác cấu trúc) | gộp, tách, xoay, xóa/trích trang, sắp xếp trang, crop, số trang, hình mờ | pdf-lib trong trình duyệt |
| Trung bình | nén, mật khẩu/mở khóa, PNG/JPG sang PDF, PDF sang PNG/JPG, TXT sang PDF | pdf.js + canvas, pdf-lib, qpdf-wasm |
| Khó | chú thích/chỉnh sửa/ký trực quan, redact thật sự | viewer tùy biến, ghi lại nội dung |
| Rất khó | OCR, DOCX/XLSX/PPTX hai chiều, sửa PDF hỏng | Tesseract.js hoặc server, LibreOffice |
