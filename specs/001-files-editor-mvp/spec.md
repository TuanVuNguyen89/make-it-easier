# Feature Specification: Files Editor MVP (quản lý file + công cụ PDF cơ bản)

**Feature Branch**: `001-files-editor-mvp`
**Created**: 2026-11-09
**Status**: Implemented — MVP (US1–US4) và giai đoạn tương đương site tham chiếu (US5–US8) đã hoàn tất, có test tự động
**Input**: Web app cá nhân quản lý tài liệu và chỉnh sửa PDF, lấy nghiệp vụ từ khảo sát tại `docs/research/files-editor-business-analysis.md`.

## Clarifications

### Session 2026-11-09

- Q: Khi nén PDF, mức nén được xác định thế nào và "nén" thành công nghĩa là gì? → A: Chỉ tối ưu cấu trúc, không mất chất lượng, không có lựa chọn mức nén; có thể giảm rất ít.
- Q: Tên hiển thị của sản phẩm? → A: "Make it easier".

## User Scenarios & Testing

### User Story 1 - Thư viện tài liệu (Priority: P1)

Người dùng tải file lên, tạo thư mục, xem danh sách, tìm kiếm, đánh dấu yêu thích và xóa vào thùng rác.

**Why this priority**: Là nền tảng mọi công cụ khác đọc/ghi file.
**Independent Test**: Tải 3 file, tạo thư mục, chuyển file vào thư mục, yêu thích 1 file, xóa 1 file rồi khôi phục. Tải lại trang, dữ liệu vẫn còn.

**Acceptance Scenarios**:
1. **Given** thư viện rỗng, **When** mở app, **Then** thấy trạng thái rỗng và nút Tải lên.
2. **Given** đã tải file, **When** mở tab Gần đây, **Then** file xuất hiện đầu danh sách theo lần sửa cuối.
3. **Given** một file, **When** nhấn xóa, **Then** file vào Đã xóa và có thể khôi phục hoặc xóa vĩnh viễn.
4. **Given** nhiều file, **When** gõ vào ô tìm kiếm, **Then** danh sách lọc theo tên file/thư mục.

---

### User Story 2 - Tổ chức trang PDF (Priority: P1)

Gộp nhiều PDF, tách PDF, trích xuất, xóa, xoay và sắp xếp lại trang.

**Why this priority**: Nhu cầu phổ biến nhất, kỹ thuật đơn giản, chứng minh được toàn bộ luồng công cụ.
**Independent Test**: Gộp 2 PDF thành 1 và kiểm tra tổng số trang; tách theo khoảng trang và kiểm tra từng file đầu ra.

**Acceptance Scenarios**:
1. **Given** 2+ PDF được chọn, **When** gộp, **Then** ra 1 PDF theo đúng thứ tự người dùng sắp xếp.
2. **Given** PDF 10 trang, **When** tách "1-3, 4-10", **Then** ra 2 file đúng số trang.
3. **Given** PDF, **When** xóa/xoay trang chọn, **Then** bản mới phản ánh đúng, bản gốc không đổi.
4. **Given** bảng thu nhỏ trang, **When** kéo thả đổi thứ tự, **Then** xuất file đúng thứ tự mới.

---

### User Story 3 - Bảo mật, nén và đánh dấu PDF (Priority: P2)

Đặt/gỡ mật khẩu, nén giảm dung lượng, thêm hình mờ, số trang, cắt trang.

**Why this priority**: Giá trị thực tế cao nhưng không chặn các story khác.
**Independent Test**: Đặt mật khẩu, mở file bằng trình đọc ngoài phải đòi mật khẩu; gỡ mật khẩu với mật khẩu đúng thì mở được.

**Acceptance Scenarios**:
1. **Given** PDF, **When** đặt mật khẩu, **Then** file đầu ra yêu cầu mật khẩu khi mở.
2. **Given** PDF khóa, **When** nhập sai mật khẩu, **Then** báo lỗi, không tạo file.
3. **Given** PDF lớn, **When** nén, **Then** hiển thị dung lượng trước/sau; nội dung và chất lượng ảnh không đổi, và nếu không giảm được thì báo rõ thay vì tạo file lớn hơn.
4. **Given** PDF, **When** thêm số trang hoặc hình mờ với vị trí chọn, **Then** xuất hiện đúng trên mọi trang áp dụng.

---

### User Story 4 - Chuyển đổi ảnh/văn bản ↔ PDF (Priority: P2)

Chuyển JPG/PNG/TXT sang PDF và PDF sang PNG/JPG.

**Independent Test**: Chuyển 3 ảnh thành 1 PDF 3 trang; chuyển PDF 2 trang ra 2 ảnh.

**Acceptance Scenarios**:
1. **Given** nhiều ảnh, **When** chuyển sang PDF, **Then** mỗi ảnh là một trang theo thứ tự.
2. **Given** PDF, **When** chuyển sang ảnh, **Then** mỗi trang là một ảnh, tải về dạng zip.

---

### User Story 5 - Thư viện và công cụ hình ảnh (Priority: P2)

Thư viện Hình ảnh riêng (Tất cả, Gần đây, Đã xóa) và các công cụ: đổi kích thước, cắt, xoay, nén, chuyển định dạng (PNG, JPG, WebP, TIFF, AVIF), tăng cường chất lượng, xóa nền, xóa đối tượng.

**Independent Test**: Tải 1 ảnh vào thư viện Hình ảnh, đổi kích thước còn 50% và kiểm tra kích thước đầu ra; chuyển PNG sang WebP và kiểm tra chữ ký tệp.

**Acceptance Scenarios**:
1. **Given** ảnh JPG, **When** đổi kích thước theo pixel hoặc phần trăm, **Then** ảnh ra đúng kích thước, tỉ lệ giữ nếu chọn.
2. **Given** ảnh, **When** cắt theo khung chọn hoặc xoay 90/180/270, **Then** đầu ra đúng vùng/hướng, bản gốc không đổi.
3. **Given** ảnh, **When** chuyển sang PNG/JPG/WebP/TIFF/AVIF, **Then** tệp ra đúng định dạng (kiểm tra chữ ký tệp).
4. **Given** ảnh nặng, **When** nén theo chất lượng, **Then** hiển thị dung lượng trước/sau và không xuất tệp lớn hơn bản gốc.
5. **Given** ảnh, **When** xóa nền / xóa đối tượng đã tô / tăng cường, **Then** ra ảnh mới; các tính năng này chạy cục bộ bằng thuật toán không dùng dịch vụ ngoài (xem Assumptions).

---

### User Story 6 - Chú thích, chỉnh sửa và ký PDF (Priority: P2)

Trình chỉnh trên trang PDF: vẽ tay, tô sáng, văn bản, hình dạng (chữ nhật, elip, đường thẳng, mũi tên), chèn ảnh, xóa vùng bằng ô trắng, chữ ký (vẽ, gõ, tải ảnh), chữ viết tắt, ngày tháng, hộp kiểm. Ba công cụ Chú thích, Chỉnh sửa, Ký dùng chung trình chỉnh nhưng mở sẵn bộ công cụ phù hợp.

**Independent Test**: Mở PDF, tô sáng, thêm văn bản và chữ ký, xuất file, mở bằng trình đọc ngoài và thấy các thành phần đúng vị trí trang.

**Acceptance Scenarios**:
1. **Given** PDF, **When** đặt chú thích lên trang rồi xuất, **Then** tệp mới chứa chú thích đúng trang và vị trí, bản gốc không đổi.
2. **Given** trang xoay, **When** đặt chú thích, **Then** chú thích hiển thị đúng hướng nhìn thấy.
3. **Given** chữ ký (vẽ/gõ/ảnh), **When** đặt lên trang, **Then** kéo, đổi kích thước được và xuất đúng.
4. **Given** đã đặt nhiều thành phần, **When** hoàn tác/làm lại hoặc xóa một thành phần, **Then** trạng thái đúng.
5. **Given** PDF có chữ, **When** chọn công cụ Sửa chữ có sẵn, bấm vào một đoạn chữ và gõ nội dung mới, **Then** tệp xuất ra không còn chữ gốc ở tầng nội dung (không trích xuất được) và chữ mới nằm đúng vị trí, đúng hướng, kể cả trên trang xoay.
6. **Given** đoạn văn nhiều dòng, **When** bấm vào đoạn và sửa, **Then** cả đoạn là một khối sửa; chữ mới tự xuống dòng trong bề rộng khối, mọi dòng cũ bị xóa, chữ ở cột bên cạnh không bị đụng.
7. **Given** nhiều chỗ đã sửa, **When** bấm "Áp dụng thay đổi", **Then** các thay đổi được đưa vào tài liệu đang làm việc (tải về/lưu ngay được) và có thể sửa tiếp; **When** bấm "Hủy bỏ thay đổi", **Then** mọi thay đổi chưa áp dụng bị bỏ và có thể hoàn tác.
8. **Given** đoạn chữ không xóa được ở tầng nội dung (ví dụ nằm trong khối ghép sẵn), **When** xuất, **Then** chữ mới vẫn hiển thị đúng chỗ và hệ thống báo rõ chữ gốc chỉ bị phủ lên.

---

### User Story 7 - Biên tập (redact), sửa PDF và nhận dạng chữ OCR (Priority: P3)

Che vĩnh viễn thông tin nhạy cảm; sửa PDF hỏng nhẹ; OCR PDF/ảnh quét thành PDF có thể tìm kiếm và chọn chữ.

**Independent Test**: Che một vùng chữ rồi xác nhận chữ gốc không còn trích xuất được; OCR ảnh chứa chữ và kiểm tra văn bản có thể trích xuất.

**Acceptance Scenarios**:
1. **Given** PDF, **When** đánh dấu vùng cần che và áp dụng, **Then** vùng đó đen hoàn toàn và chữ trong vùng không thể trích xuất ra nữa (trang được chuyển thành ảnh).
2. **Given** PDF lỗi cấu trúc nhẹ (xref hỏng), **When** sửa, **Then** ra PDF mở được; PDF không cứu được báo lỗi rõ.
3. **Given** PDF/ảnh quét, **When** OCR (tiếng Việt, tiếng Anh), **Then** PDF ra có lớp chữ chọn và tìm được.

---

### User Story 8 - Chuyển đổi Office và trung tâm chuyển đổi (Priority: P3)

PDF sang DOCX/XLSX/PPTX và DOCX/XLSX/PPTX sang PDF; trang "Chuyển đổi PDF" gợi ý định dạng đích theo tệp chọn.

**Independent Test**: Chuyển DOCX có tiêu đề và đoạn văn sang PDF rồi trích xuất văn bản đúng; chuyển PDF sang DOCX và mở lại có đủ văn bản.

**Acceptance Scenarios**:
1. **Given** DOCX/XLSX/PPTX, **When** chuyển sang PDF, **Then** PDF chứa đủ nội dung văn bản/bảng theo thứ tự (định dạng cơ bản, xem Assumptions).
2. **Given** PDF, **When** chuyển sang DOCX/XLSX/PPTX, **Then** tệp mở được, DOCX/XLSX giữ văn bản theo dòng/bảng, PPTX mỗi trang một slide.
3. **Given** một tệp, **When** mở trang Chuyển đổi PDF, **Then** thấy các định dạng đích phù hợp và đi tới đúng công cụ.

---

### Edge Cases

- File không phải PDF hoặc PDF hỏng: báo lỗi rõ, không làm hỏng thư viện.
- File rất lớn (trên 100 MB): cảnh báo, xử lý có tiến trình và hủy được.
- PDF có mật khẩu khi gộp/tách: yêu cầu mở khóa trước.
- Hết dung lượng lưu trữ trình duyệt: báo lỗi và gợi ý tải kết quả về máy.
- Trùng tên file: tự thêm hậu tố.
- Nén không giảm được dung lượng: báo "không giảm thêm được" và không lưu file mới.
- Ảnh lớn hơn giới hạn canvas của trình duyệt: báo lỗi rõ, không treo.
- Tệp Office có mật khẩu hoặc hỏng: báo lỗi rõ, không tạo tệp.
- OCR trang trắng hoặc không có chữ: báo "không nhận ra chữ nào" và không tạo tệp (đầu ra sẽ giống hệt đầu vào).
- PDF quét (không có lớp chữ) khi chuyển sang Word/Excel: báo rõ và dẫn tới công cụ OCR.
- Đóng tab giữa chừng khi đang xử lý: không để lại file dở trong thư viện.

## Requirements

### Functional Requirements

- **FR-001**: Hệ thống PHẢI cho phép tải lên một hoặc nhiều file, kéo thả, và lưu cục bộ.
- **FR-002**: Hệ thống PHẢI hỗ trợ thư mục lồng nhau, đổi tên, di chuyển, yêu thích, thùng rác có khôi phục.
- **FR-003**: Hệ thống PHẢI có các góc nhìn Tất cả, Gần đây, Yêu thích, Đã xóa và tìm theo tên.
- **FR-004**: Hệ thống PHẢI cung cấp danh mục công cụ có nhóm và lọc theo nhóm.
- **FR-005**: Công cụ PHẢI gộp, tách, trích xuất, xóa, xoay, sắp xếp trang PDF.
- **FR-006**: Công cụ PHẢI đặt và gỡ mật khẩu, nén, cắt trang, hình mờ, số trang. Nén chỉ tối ưu cấu trúc (không mất chất lượng, không có mức nén để chọn), hiển thị dung lượng trước/sau, và không xuất file lớn hơn bản gốc.
- **FR-007**: Công cụ PHẢI chuyển JPG/PNG/TXT sang PDF và PDF sang JPG/PNG.
- **FR-008**: Mọi công cụ KHÔNG ĐƯỢC ghi đè file gốc; kết quả là file mới có thể lưu vào thư viện hoặc tải về.
- **FR-009**: Tác vụ nặng PHẢI có tiến trình và có thể hủy, không làm đơ giao diện.
- **FR-010**: Nội dung file KHÔNG ĐƯỢC rời khỏi trình duyệt trong MVP.
- **FR-011**: Giao diện PHẢI hỗ trợ tiếng Việt và tiếng Anh.
- **FR-012**: Hệ thống PHẢI có thư viện Hình ảnh (Tất cả, Gần đây, Đã xóa) và các công cụ ảnh: đổi kích thước, cắt, xoay, nén, chuyển PNG/JPG/WebP/TIFF/AVIF, tăng cường, xóa nền, xóa đối tượng.
- **FR-013**: Hệ thống PHẢI cho đặt chú thích, chỉnh sửa và chữ ký lên trang PDF (xem User Story 6) và xuất thành tệp mới.
- **FR-017**: Hệ thống PHẢI cho sửa chữ có sẵn trên PDF theo khối đoạn văn: xóa lệnh vẽ chữ gốc khỏi nội dung trang (khớp theo vị trí từng dòng, không phụ thuộc phông) rồi vẽ chữ mới tại đúng vị trí và hướng, tự xuống dòng trong khối, giữ họ phông (sans/serif/mono), đậm/nghiêng và màu của chữ gốc bằng phông tương đương số đo có tiếng Việt; có Áp dụng/Hủy bỏ thay đổi theo lô; khi không xóa được thì phủ lên và cảnh báo thay vì làm hỏng bố cục.
- **FR-014**: Công cụ biên tập PHẢI loại bỏ thật sự nội dung bị che khỏi tệp xuất (không chỉ phủ hình đen lên chữ).
- **FR-015**: Hệ thống PHẢI sửa PDF lỗi cấu trúc nhẹ và nhận dạng chữ (OCR) tiếng Việt và tiếng Anh, chạy cục bộ.
- **FR-016**: Hệ thống PHẢI chuyển PDF sang DOCX/XLSX/PPTX và DOCX/XLSX/PPTX sang PDF ở mức nội dung cơ bản, và có trang Chuyển đổi PDF chọn định dạng đích.

### Key Entities

- **Document**: id, tên, loại MIME, kích thước, số trang, thư mục cha, yêu thích, trạng thái xóa, thời điểm tạo/sửa, tham chiếu blob.
- **Folder**: id, tên, thư mục cha, thời điểm sửa.
- **ToolRun**: công cụ, danh sách input, tham số, trạng thái, tiến trình, output.
- **Tool**: id, nhóm, tên, mô tả, loại input, schema tham số.

## Success Criteria

- **SC-001**: Người dùng mới gộp 2 PDF trong dưới 30 giây kể từ lúc mở app.
- **SC-002**: Gộp PDF 50 trang hoàn tất dưới 5 giây trên máy phổ thông, giao diện không đơ.
- **SC-003**: Tất cả tool P1/P2 có test tự động với file mẫu, đầu ra mở được bằng trình đọc PDF chuẩn.
- **SC-004**: Dữ liệu thư viện còn nguyên sau khi tải lại trang.
- **SC-005**: Không có request mạng chứa nội dung file khi dùng công cụ.

## Assumptions

- Dùng một người dùng, không đăng nhập; không đồng bộ giữa thiết bị.
- Xử lý client-side (xem `plan.md`); OCR, DOCX/XLSX/PPTX, redact và sửa PDF hỏng nằm ngoài MVP.
- Giả định site tham chiếu xử lý tương tự; chưa xác minh được.
- Trình duyệt hiện đại hỗ trợ IndexedDB, Web Worker, WASM.
- Ngoài phạm vi vì site tham chiếu cũng đánh dấu "Sớm" (chưa ra mắt) và cần máy chủ: Yêu cầu chữ ký, Không gian làm việc, Biểu mẫu có thể điền.
- Tăng cường ảnh, xóa nền và xóa đối tượng chạy cục bộ bằng thuật toán cổ điển (không phải mô hình AI tạo sinh), chất lượng thấp hơn dịch vụ AI.
- Chuyển đổi Office là chuyển nội dung cơ bản (văn bản, tiêu đề, danh sách, bảng; PPTX sang PDF lấy văn bản và ảnh), không dựng lại bố cục phức tạp.
- HEIF/HEIC không có bộ mã hóa miễn phí chạy trong trình duyệt; thay bằng AVIF (cùng họ HEIF).
