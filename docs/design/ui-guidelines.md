# Hướng dẫn giao diện (UI guidelines)

Áp dụng cho mọi task giao diện của `specs/001-files-editor-mvp`. Quyết định ngày 2026-11-09.

## 1. Nguồn và ranh giới

- **Nguồn nghiệp vụ**: khảo sát một web quản lý/chỉnh sửa PDF (xem `docs/research/`). Chỉ lấy *cấu trúc luồng*: khung app (topbar + sidebar), thư viện tài liệu (tab Tất cả/Gần đây/Yêu thích, thư mục, trạng thái rỗng), danh mục công cụ dạng lưới thẻ có tab lọc theo nhóm, công cụ mở trong hộp thoại (đặt tên, thêm file, hành động chính).
- **Constitution V (bắt buộc)**: không dùng logo, tên sản phẩm, văn bản marketing, biểu tượng, bảng màu hay mã nguồn của site tham chiếu. Tên, mô tả công cụ, biểu tượng và màu đều tự viết.
- **Tên sản phẩm**: "Make it easier" (quyết định 2026-11-09), đặt ở một khóa i18n duy nhất. Tên thư mục `files-editor` chỉ là tên kho mã, không hiển thị cho người dùng.
- **Nguồn nguyên tắc thiết kế**: skill `design-taste-frontend` (repo taste-skill v2.5.1). Chỉ đọc làm tham khảo, **chưa cài plugin**: skill đó có hook Stop chạy script Node và được viết cho trang giới thiệu, không phải app. Phần bỏ qua: hero, ảnh stock, WebGL, hiệu ứng cuộn, nav cố định kiểu marketing, "một section mỗi màn hình".

## 2. Nguyên tắc lấy từ taste-skill (áp dụng cho app)

**Một hệ thống duy nhất**
- Thang khoảng cách 4, 8, 12, 16, 24, 32, 48, 64 (token `--s-1`…). Không viết số khác.
- Một kiểu nút chính (chỉ một nút nền màu mỗi màn hình), một kiểu nút phụ, một họ bo góc (`--r-sm` điều khiển, `--r-md` panel, `--r-lg` thẻ), một kiểu thẻ, một đường kẻ mảnh 1px.
- Một chiều cao cho mỗi loại thẻ trong cùng một hàng.

**Màu**
- Giao diện 90–95% trung tính. Một màu nhấn duy nhất cho nút chính, vòng focus, liên kết, trạng thái đang chọn.
- Mực gần đen ấm, không dùng `#000`. Đường kẻ = 12–15% của màu mực.
- Không dùng tím/lavender (hue OKLCH 270–330). Màu nhấn đề xuất: xanh teal (hue ≈ 190), chữ trên nền nhấn đạt tương phản 4.5:1.
- Có chế độ sáng; chế độ tối là phần mở rộng sau, không trong MVP.
- Làm nổi bật bằng độ tương phản, không dùng màu đánh dấu hay thanh màu sau chữ.

**Chữ**
- Một cặp phông: tiêu đề **Be Vietnam Pro**, nội dung **Inter** (cả hai hỗ trợ tiếng Việt đầy đủ).
- Nội dung đọc ≥ 16px, line-height 1.5–1.8, màu mực (tương phản ≥ 7:1). Màu `--muted` (≥ 4.5:1) chỉ cho nhãn, ngày, meta. Không có chữ nhỏ hơn 13px.
- Nhãn 13px độ đậm 500, câu viết hoa chữ đầu (sentence case), không viết hoa toàn bộ hay tracking rộng.
- Mỗi loại phần tử một cỡ chữ duy nhất trên toàn app (mọi tiêu đề thẻ cùng cỡ). Dòng chữ tối đa ~62 ký tự.

**Kích thước điều khiển**
- Nút cao 44px, nhãn 16px, padding ngang 24px. Ô nhập 48px, nhãn 14px hiển thị phía trên, chữ nhập 16px (để trình duyệt di động không phóng to). Vùng chạm ≥ 44×44.
- Tối đa hai nút trong một hàng hành động; hàng đó rộng hết cỡ trên điện thoại.

**Form và lỗi**
- Nhãn nhìn thấy được cho mọi trường (placeholder không phải nhãn).
- Kiểm tra khi gửi, không kiểm tra khi đang gõ. Lỗi nằm dưới trường, gắn bằng `aria-describedby`, đặt `aria-invalid="true"`, nêu tên trường và cách sửa. Trường lỗi đầu tiên nhận focus.
- Một dòng trạng thái `role="status"` dưới nút. Chỉ báo thành công sau khi xử lý xong thật. Lỗi giữ nguyên dữ liệu đã nhập.
- Tên nút chính đúng hành động ("Hợp nhất", "Tách PDF"), không dùng "Gửi" hay "OK".

**Trợ năng (kiểm tra được)**
- Mọi nút/liên kết/tab/ô nhập có tên truy cập; nút chỉ có biểu tượng có `aria-label` theo ngôn ngữ giao diện.
- Cấp tiêu đề tăng từng bậc. Không dùng `tabindex` > 0. Thứ tự Tab = thứ tự đọc.
- Vòng focus 2px màu nhấn, tương phản ≥ 3:1, không có hoạt ảnh, không bị che bởi topbar cố định.
- Nút mở menu có `aria-expanded`. Có skip link đầu trang. `<html lang>` theo ngôn ngữ đang chọn (mặc định `vi`).
- Hộp thoại công cụ: đóng bằng Esc, giữ focus trong hộp thoại, trả focus về nút đã mở.

**Chuyển động**
- Tinh tế, không gây chú ý: thẻ nâng 2px khi hover, nút đổi bậc khi hover và nhấn xuống khi bấm, gạch chân vẽ dần. Tôn trọng `prefers-reduced-motion`.
- Không có tilt, carousel, tab tự chuyển.

## 3. Quy tắc riêng cho app (không có trong taste-skill)

- **Khung**: topbar cố định (logo, ô tìm kiếm, chuyển ngôn ngữ) cao 56px + sidebar trái. Dưới 640px: sidebar thành thanh điều hướng dưới hoặc ngăn kéo.
- **Sidebar MVP**: Tài liệu (Tất cả, Gần đây, Yêu thích, Đã xóa), Công cụ. Không hiển thị mục "Sớm/Beta" cho tính năng chưa có.
- **Thư viện**: breadcrumb, nút "Thư mục mới", nút "Tải lên" (nút chính duy nhất), ô sắp xếp, bảng danh sách. Trạng thái rỗng có biểu tượng, một câu mô tả và nút Tải lên. Thả file vào khu vực danh sách để tải lên.
- **Danh mục công cụ**: lưới thẻ (biểu tượng, tên, mô tả một dòng), tab lọc theo nhóm (Tổ chức, Bảo mật & tối ưu, Chuyển đổi), ô tìm công cụ. Chỉ hiện công cụ MVP.
- **Trang công cụ** (dựng từ schema `meta.ts`): hộp thoại hoặc trang với ô đặt tên kết quả, vùng thêm file (từ máy hoặc thư viện), tùy chọn theo schema, thanh tiến trình có nút Hủy, kết quả với "Lưu vào thư viện" và "Tải về". Nút chính bị khóa khi chưa đủ đầu vào và có lý do hiển thị bằng chữ.
- **Biểu tượng**: bộ biểu tượng nét một kiểu (ví dụ Lucide, giấy phép ISC), một độ dày nét. Không dùng biểu tượng của site tham chiếu.
- **Kiểm tra giao diện**: mỗi màn hình kiểm tra ở 1440, 1024, 768, 390 px — không tràn ngang, không chữ bị cắt, không vùng trống do ảnh/biểu tượng không hiển thị.

## 4. Token khởi đầu (CSS)

```css
:root {
  --ink: #1d1c1a;          /* mực ấm */
  --muted: #5f5c57;        /* ≥ 4.5:1 trên --bg */
  --bg: #fbfaf8;
  --surface: #ffffff;
  --line: rgb(29 28 26 / .13);
  --action: #0f6f6a;       /* một màu nhấn (teal) */
  --action-ink: #ffffff;
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px;
  --r-sm: 8px; --r-md: 12px; --r-lg: 20px;
  --btn-h: 44px; --field-h: 48px; --topbar-h: 56px;
}
```

Kiểm tra lại tương phản `--action` trên `--bg` và `--action-ink` trên `--action` bằng công cụ khi dựng thật; điều chỉnh giá trị chứ không phá quy tắc.
