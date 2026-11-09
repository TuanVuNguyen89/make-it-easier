# Tasks: Files Editor MVP

Định dạng: `[ID] [P?] [Story] Mô tả`. `[P]` là chạy song song được.

## Phase 1: Khởi tạo

- [x] T001 Tạo dự án Vite + React + TS strict, ESLint, Prettier
- [x] T002 [P] Cài Tailwind, React Router, Zustand, idb, i18next, pdf-lib, pdfjs-dist, fflate
- [x] T003 [P] Cấu hình Vitest và Playwright
- [x] T004 [P] Tạo `tests/fixtures/` với PDF mẫu (1 trang, 10 trang, có mật khẩu, hỏng) và file mẫu JPG, PNG, TXT

## Phase 2: Nền tảng (chặn mọi story)

- [x] T005 Lược đồ IndexedDB: documents, folders, blobs, runs (`src/storage/`)
- [x] T006 Repository: tạo/đọc/đổi tên/di chuyển/xóa mềm Document và Folder + test
- [x] T007 Layout ứng dụng: topbar, sidebar, router theo các route Tài liệu và Công cụ
- [x] T008 i18n vi/en (mặc định vi), chuyển ngôn ngữ; tên sản phẩm "Make it easier" ở một khóa i18n duy nhất
- [x] T009 Hợp đồng công cụ `ToolDefinition` và registry (`src/tools/registry.ts`)
- [x] T010 Web Worker `toolRunner` có tiến trình và hủy
- [x] T011 Trang `ToolPage` dựng form từ schema, chọn file từ máy hoặc thư viện, lưu/tải kết quả

## Phase 3: US1 Thư viện tài liệu (P1) 🎯 MVP

- [x] T012 [US1] Tải lên (nút + kéo thả), phát hiện loại file, đọc số trang PDF
- [x] T013 [US1] Bảng danh sách: tên, ngày sửa, hoạt động, chọn nhiều, sắp xếp
- [x] T014 [US1] Thư mục: tạo, vào, breadcrumb, di chuyển
- [x] T015 [US1] Tab Tất cả, Gần đây, Yêu thích; trang Đã xóa với khôi phục/xóa vĩnh viễn
- [x] T016 [US1] Tìm kiếm theo tên
- [x] T017 [US1] Trạng thái rỗng, tên trùng, lỗi hết quota
- [x] T018 [US1] E2E: tải lên, thư mục, yêu thích, xóa, khôi phục, tải lại trang

## Phase 4: US2 Tổ chức trang PDF (P1)

- [x] T019 [P] [US2] Công cụ `merge` + test
- [x] T020 [P] [US2] Công cụ `split` (khoảng trang) + test
- [x] T021 [P] [US2] Công cụ `extract-pages` + test
- [x] T022 [P] [US2] Công cụ `delete-pages` + test
- [x] T023 [P] [US2] Công cụ `rotate-pages` + test
- [x] T024 [US2] Trình thumbnail trang bằng pdf.js (cache, render lười)
- [x] T025 [US2] Công cụ `organize-pages` (kéo thả, xóa, xoay trực quan) + test
- [x] T026 [US2] Trang danh mục công cụ, tab lọc theo nhóm, ô tìm công cụ
- [x] T027 [US2] E2E: gộp 2 PDF, tách PDF

## Phase 5: US3 Bảo mật, nén, đánh dấu (P2)

- [x] T028 [US3] Phase 0: so sánh qpdf-wasm với phương án khác, ghi quyết định
- [x] T029 [P] [US3] `protect` và `unlock` + test (mở bằng trình đọc ngoài)
- [x] T030 [P] [US3] `compress` (chỉ tối ưu cấu trúc, không mất chất lượng; không xuất file lớn hơn gốc) + test + hiển thị dung lượng trước/sau
- [x] T031 [P] [US3] `crop-pages` + test
- [x] T032 [P] [US3] `page-numbers` + test
- [x] T033 [P] [US3] `watermark` (văn bản, ảnh) + test

## Phase 6: US4 Chuyển đổi (P2)

- [x] T034 [P] [US4] `images-to-pdf` (JPG/PNG) + test
- [x] T035 [P] [US4] `text-to-pdf` + test
- [x] T036 [P] [US4] `pdf-to-images` (PNG/JPG, xuất zip) + test
- [x] T037 [US4] E2E: ảnh → PDF → ảnh

## Phase 7: Hoàn thiện

- [x] T038 Kiểm thử không có request mạng chứa nội dung file (SC-005)
- [x] T039 Hiệu năng: gộp 50 trang dưới 5 giây (SC-002)
- [x] T040 Trợ năng, responsive, PWA offline
- [x] T041 Tài liệu README và hướng dẫn thêm công cụ mới

## Phase 8: Tương đương site tham chiếu (US5–US8)

### US5 Hình ảnh
- [x] T042 [US5] Thư viện Hình ảnh: mục sidebar Tất cả/Gần đây/Đã xóa lọc theo loại ảnh + E2E
- [x] T043 [P] [US5] Hạ tầng công cụ ảnh (`src/lib/image.ts`: giải mã, vẽ, mã hóa PNG/JPG/WebP/TIFF/AVIF) + test
- [x] T044 [P] [US5] `image-resize`, `image-rotate`, `image-crop` + test
- [x] T045 [P] [US5] `image-compress` (trước/sau, không lớn hơn gốc) + `image-convert` và 5 lối tắt PNG/JPG/WebP/TIFF/AVIF + test
- [x] T046 [P] [US5] `image-enhance`, `image-remove-bg`, `image-erase` (cục bộ, cổ điển) + test
- [x] T047 [US5] Danh mục Công cụ hình ảnh (tab Tối ưu hóa/Sửa đổi/Chuyển thành) + trình tô vùng cho xóa đối tượng + E2E

### US6 Chú thích, chỉnh sửa, ký
- [x] T048 [US6] Mô hình chú thích và module xuất (`applyAnnotations`) có xoay trang + test bằng pdf.js
- [x] T049 [US6] Trình chỉnh trang PDF (vẽ, tô sáng, văn bản, hình, ảnh, ô trắng, kéo/đổi cỡ, hoàn tác/làm lại)
- [x] T050 [US6] Chữ ký (vẽ, gõ, ảnh), chữ viết tắt, ngày, hộp kiểm; ba công cụ `annotate`, `edit`, `sign`
- [x] T051 [US6] E2E: tô sáng + văn bản + chữ ký, xuất và kiểm tra

### US7 Biên tập, sửa, OCR
- [x] T052 [P] [US7] `repair` bằng qpdf + test (xref hỏng)
- [x] T053 [US7] `redact`: chọn vùng, chuyển trang thành ảnh, kiểm tra chữ gốc biến mất + test + E2E
- [x] T054 [US7] `ocr` bằng tesseract.js (vie, eng) tự host, PDF có lớp chữ + test + E2E

### US8 Office và trung tâm chuyển đổi
- [x] T055 [P] [US8] `docx-to-pdf`, `xlsx-to-pdf`, `pptx-to-pdf` + test
- [x] T056 [P] [US8] `pdf-to-docx`, `pdf-to-xlsx`, `pdf-to-pptx` + test
- [x] T057 [US8] Trang "Chuyển đổi PDF" (gợi ý định dạng đích) + E2E

### Sửa chữ có sẵn trên PDF (US6, mở rộng)
- [x] T059 [US6] Bộ phân tích luồng nội dung (`pdfContent`): vị trí mỗi lệnh Tj/TJ/'/" theo ma trận, xóa lệnh + test
- [x] T060 [US6] Thành phần `textEdit` trong `applyAnnotations`: xóa chữ gốc, vẽ chữ mới đúng hướng, phủ + cảnh báo khi không xóa được + test (kể cả trang xoay, XObject, lệnh nối tiếp)
- [x] T061 [US6] Công cụ "Sửa chữ có sẵn" trong trình chỉnh: đoạn chữ bấm được, ô sửa, phông, khôi phục/xóa, cảnh báo sau khi xuất + E2E
- [x] T062 [US6] Kiểm chứng trên PDF thật do LibreOffice tạo + axe

- [x] T063 [US6] Gom dòng thành khối đoạn văn (`buildBlocks`), sửa cả đoạn, chữ mới tự xuống dòng (`wrapParagraphs`), khớp theo từng phần của khối + test (kể cả PDF thật nhiều dòng của LibreOffice)
- [x] T064 [US6] "Áp dụng thay đổi" (đưa vào tài liệu nền, sửa tiếp được) và "Hủy bỏ thay đổi" (hoàn tác được) trong trình chỉnh + E2E

- [x] T065 [US6] Giữ phông và màu chữ gốc: theo dõi Tf/màu tô trong luồng nội dung, phân loại phông (`classifyFont`), phông tương đương Liberation (đóng gói, tải khi dùng), chọn họ/đậm/nghiêng trong bảng sửa + test (số đo bề rộng, điểm ảnh cho 12 biến thể phông, PDF thật của LibreOffice)

- [x] T066 [US6] Sửa chữ tại chỗ: ô sửa đè đúng khung chữ trên trang (cùng vị trí, hướng, phông, cỡ, màu; đoạn nhiều dòng giữ bề rộng), con trỏ đặt đúng chỗ bấm (`caretIndex`), Esc để đóng; bảng bên dưới chỉ còn định dạng + test (đơn vị + E2E)

- [x] T067 [US6] Căn lề trái/giữa/phải cho chữ đã sửa (trường `align`, `alignOffset`): xem trước, ô sửa tại chỗ, con trỏ và tệp xuất cùng một quy tắc; bảng phông chuyển sang cột bên phải trang + test

### Ứng dụng máy tính (Electron)
- [x] T068 Đóng gói Electron cho macOS/Windows/Linux: `electron/` (main, preload, kho SQLite), giao thức `app://` phục vụ bản dựng, cửa sổ cô lập (contextIsolation, sandbox), một cửa sổ duy nhất
- [x] T069 Kho dữ liệu dùng chung giao diện `LibraryStore`: IndexedDB (web) và SQLite + tệp thật (app, qua IPC) + test (repository chạy trên SQLite, mở lại vẫn còn, chặn id tệp bất hợp lệ)
- [x] T070 electron-builder (dmg/zip, nsis/portable, AppImage/deb/rpm), workflow GitHub Actions dựng cả ba hệ điều hành, E2E Electron thật (cả bản đã đóng gói)

### Hoàn thiện
- [x] T058 Cập nhật README, a11y/responsive/offline cho các trang mới, chạy `npm run test:all`

## Ngoài phạm vi (site tham chiếu cũng chưa ra mắt, cần máy chủ)

- Yêu cầu chữ ký, Không gian làm việc, Biểu mẫu có thể điền

## Phụ thuộc

Phase 1 → Phase 2 → US1 và US2 (có thể song song sau Phase 2) → US3, US4 → Phase 7 → Phase 8 (US5–US8, độc lập nhau; T048 → T049 → T050; T053 dùng rasterize của T036).
