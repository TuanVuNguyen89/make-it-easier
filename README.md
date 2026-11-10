# Make it easier

Ứng dụng web cá nhân để quản lý tài liệu và chỉnh sửa PDF **hoàn toàn trong trình duyệt**: tệp của bạn không bao giờ được gửi lên máy chủ, và sau lần tải đầu ứng dụng chạy được cả khi mất mạng.

## Tính năng

| Nhóm | Công cụ |
|---|---|
| Thư viện tài liệu | Tải lên (nút hoặc kéo thả), thư mục lồng nhau, đổi tên, di chuyển, yêu thích, tìm theo tên, tab Tất cả / Gần đây / Yêu thích, thùng rác có khôi phục, chọn nhiều |
| Thư viện hình ảnh | Thư viện riêng cho ảnh: Tất cả / Gần đây / Đã xóa |
| Tổ chức trang PDF | Gộp, tách, trích xuất, xóa, xoay, sắp xếp trực quan (kéo thả), cắt lề, đánh số trang, hình mờ chữ/ảnh |
| Chú thích và ký | Chú thích (vẽ tay, tô sáng, chữ, hình, mũi tên), chỉnh sửa (**sửa chữ có sẵn trực tiếp trên PDF**, thêm chữ, ảnh, hộp kiểm, ô trắng), ký (vẽ/gõ/ảnh, chữ viết tắt, ngày), biên tập (che vĩnh viễn thông tin nhạy cảm) |
| Bảo mật và tối ưu | Đặt mật khẩu (AES-256), mở khóa, nén không mất chất lượng, sửa PDF lỗi cấu trúc |
| Chuyển đổi PDF | Ảnh JPG/PNG ↔ PDF, TXT → PDF, PDF → PNG/JPG (zip), nhận dạng chữ OCR (tiếng Việt, tiếng Anh), Word/Excel/PowerPoint ↔ PDF, trang gợi ý định dạng đích |
| Công cụ ảnh | Đổi kích thước, cắt, xoay/lật, nén, đổi định dạng (PNG, JPG, WebP, TIFF, AVIF), tăng cường, xóa nền, xóa đối tượng |

Giao diện tiếng Việt (mặc định) và tiếng Anh. Tất cả chạy trong trình duyệt, kể cả OCR.

**Không làm vì site tham chiếu cũng chưa ra mắt và cần máy chủ:** yêu cầu chữ ký, không gian làm việc cộng tác, thư viện biểu mẫu.

## Chạy

Cần Node 22+.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # bản build có service worker (offline)
npm run preview
```

## Kiểm thử

```bash
npm run typecheck
npm run lint
npm test             # Vitest: module công cụ, lưu trữ, tải lên (file mẫu thật)
npm run test:e2e     # Playwright trên dev server (cần Google Chrome)
npm run test:pwa     # Playwright trên bản build: chạy offline (kể cả OCR), manifest
npm run test:all     # tất cả các bước trên
```

File mẫu nằm ở `tests/fixtures/`; tạo lại bằng `scripts/make-fixtures.sh` (cần `node`, Ghostscript `gs`, Python 3 + Pillow). `report.docx` và `table.xlsx` do LibreOffice tạo từ `tests/fixtures/src/` (lệnh `soffice --convert-to` ghi trong script). Bộ test `office-interop` dùng LibreOffice thật làm "trình đọc ngoài" để kiểm tra tệp DOCX/XLSX/PPTX xuất ra; tự bỏ qua nếu không có `soffice`.

Dữ liệu OCR, phông và tài nguyên pdf.js được sao chép vào `public/` bởi `npm run assets` (tự chạy trước `dev` và `build`). Dữ liệu OCR (~24 MB) không được precache mà cache khi dùng lần đầu.

## Kiến trúc

```
src/
  app/                 khung ứng dụng (topbar, sidebar, router)
  features/library/    thư viện tài liệu
  features/tools/      danh mục công cụ, ToolPage dựng form từ schema, trình chỉnh trang
  tools/<id>/          meta.ts (khai báo UI) + run.ts (hàm thuần) + run.test.ts
  workers/             toolRunner (Web Worker), runTool (cầu nối, hủy bằng terminate)
  storage/             IndexedDB: documents, folders, blobs, runs; repository
  lib/                 pdf-lib, qpdf-wasm, pdf.js (thumbnail, vẽ trang, trích chữ), ảnh (RGBA thuần JS + codec), OCR, Office (OOXML), chú thích, phông Unicode
  i18n/                vi.json, en.json
```

Nguyên tắc (xem `.specify/memory/constitution.md`): riêng tư mặc định, mỗi công cụ là một hàm thuần kiểm thử được, không ghi đè bản gốc, tác vụ nặng trong Worker có thể hủy và thư viện nặng nạp lười, UI tự thiết kế (`docs/design/ui-guidelines.md`).

## Thêm một công cụ mới

Công cụ được phát hiện tự động từ thư mục `src/tools/<id>/`; không cần sửa router hay trang công cụ.

1. **`meta.ts`** xuất `meta: ToolMeta`: `id`, `group` (`organize` | `secure` | `convert`), biểu tượng lucide, `inputs` (đuôi tệp, MIME, số tệp tối thiểu/tối đa, có cần thứ tự không) và `params` (các trường: `text`, `password`, `number`, `select`, `boolean`, `pageRanges`; thêm `required`/`mustMatch` nếu cần kiểm tra khi gửi). Công cụ cần giao diện riêng đặt `editor`.
2. **`run.ts`** xuất `run: RunFn`: `(inputs: Uint8Array[], options, ctx) => Promise<ToolOutput[]>`. Không chạm DOM hay lưu trữ. Gọi `ctx.progress(0..1)` và `throwIfAborted(ctx.signal)` giữa các bước nặng. Lỗi dự kiến ném `ToolError(code)` (`invalid-pdf`, `encrypted`, `wrong-password`, `invalid-options`, `invalid-image`, `invalid-office`, `no-reduction`, `no-text`, `no-text-layer`).
3. **`run.test.ts`** kiểm thử với file thật (`tests/fixtures/`): kết quả đúng, và ít nhất lỗi đầu vào (PDF có mật khẩu/hỏng, tùy chọn sai). Hàm trợ giúp ở `src/tools/testUtils.ts` (`numberedPdf`, `widths`, `pageTexts`...).
4. **i18n**: thêm `tools.<id>.name | desc | action` và nhãn tham số vào `src/i18n/vi.json` và `en.json`.
5. Nếu thư viện nặng, nạp bằng `import()` bên trong `run` (xem `src/lib/qpdf.ts`) để không vào bundle chính.
6. Thêm một test E2E ngắn trong `tests/e2e/` nếu luồng có UI đặc thù.

## Giới hạn đã biết

- Nén PDF chỉ tối ưu cấu trúc (không làm giảm chất lượng ảnh), nên có thể giảm ít; nếu không nhỏ hơn bản gốc, công cụ báo và không tạo tệp.
- Mật khẩu đã quên không khôi phục được.
- Hình mờ và số trang tính cả trang đã xoay; số trang dùng phông chuẩn nên chỉ in chữ số Latin.
- PDF → ảnh giới hạn khoảng 60 triệu điểm ảnh mỗi trang.
- Cảnh báo khi tệp lớn hơn 100 MB; xử lý chạy trong bộ nhớ trình duyệt.
- Chuyển đổi Office là chuyển nội dung cơ bản: DOCX → PDF giữ tiêu đề, đoạn, đậm/nghiêng, danh sách, bảng (không giữ phông, ảnh, bố cục phức tạp); XLSX → PDF là bảng giá trị (không giữ định dạng ô); PPTX → PDF đặt chữ và ảnh PNG/JPG đúng vị trí (không dựng nền, hiệu ứng, biểu đồ). PDF → DOCX/XLSX dựa vào lớp chữ nên PDF quét cần OCR trước; PDF → PPTX tạo slide dạng ảnh kèm chữ trong ghi chú.
- Biên tập (redact) chuyển trang có vùng che thành ảnh nên chữ bên dưới biến mất khỏi tệp; đổi lại trang đó không chọn/tìm chữ được.
- Tăng cường, xóa nền và xóa đối tượng dùng thuật toán cổ điển (không phải AI): xóa nền cho nền đồng màu, xóa đối tượng hiệu quả với vật nhỏ trên nền ít chi tiết.
- Trình duyệt không có bộ mã hóa HEIF/HEVC miễn phí, nên thay bằng AVIF (cùng họ HEIF).
- Sửa PDF dùng pdf-lib đọc tuần tự và ghi lại xref mới (bản wasm của qpdf không tự khôi phục xref); PDF mất hết nội dung thì báo lỗi.
- Sửa chữ có sẵn xóa lệnh vẽ chữ gốc rồi vẽ chữ mới **giữ phông và màu của chữ gốc**: công cụ đọc tên phông, đậm/nghiêng và màu tô của chữ từ nội dung trang, rồi dùng phông tương đương số đo có đủ tiếng Việt (Liberation Sans/Serif/Mono, tương đương Arial/Helvetica, Times New Roman, Courier New; xem `assets/fonts/README.md`). Không nhúng lại được chính phông gốc vì phông trong PDF thường là bản cắt con thiếu ký tự; phông lạ (Calibri, Cambria...) được xếp vào họ gần nhất theo tên và cờ phông, nên hình dáng chỉ gần giống chứ không trùng. Bạn đổi họ phông, cỡ chữ, màu ở bảng sửa. Công cụ không có tùy chọn đậm/nghiêng và không tự áp đậm/nghiêng của chữ gốc lên cả đoạn (chữ mới luôn ở kiểu thường). Nếu chữ gốc nằm trong khối ghép sẵn (Form XObject) hoặc là các lệnh vẽ nối tiếp không đặt lại vị trí thì chỉ phủ chữ mới lên và công cụ báo rõ; màu tô dạng mẫu/không gian màu lạ không đọc được nên mặc định đen. Chữ được gom thành khối đoạn văn nhiều dòng (cùng cỡ, thẳng mép trái, khoảng cách dòng đều; dòng đầu mục danh sách và chữ ở cột khác không bị gộp) và chữ mới tự xuống dòng trong bề rộng khối; chữ không nằm ngang được sửa theo từng đoạn riêng. Khối được đoán theo hình học nên đoạn căn giữa/căn đều hoặc bố cục lạ có thể bị tách thành nhiều khối (sửa từng khối). "Áp dụng thay đổi" đưa các thay đổi vào tài liệu đang làm việc để sửa tiếp (cho tải về/lưu ngay), "Hủy bỏ thay đổi" bỏ các thay đổi chưa áp dụng (hoàn tác được).
- Sửa chữ diễn ra **ngay trên trang**: bấm vào khối chữ thì một ô sửa hiện đè đúng vị trí, hướng, phông, cỡ và màu của chữ gốc (đoạn nhiều dòng giữ bề rộng khối), con trỏ nằm đúng chỗ vừa bấm; Esc để đóng. Phông, cỡ, căn lề, khôi phục và xóa ở bảng bên phải.
- Căn lề trái/giữa/phải ở bảng bên phải: chữ được căn trong bề rộng khối gốc (giữa giữ tâm khối, phải giữ mép phải; đoạn nhiều dòng căn từng dòng). Mặc định căn trái, công cụ chưa tự nhận ra lề của chữ gốc.
- Trình chỉnh PDF dùng chuột/bút/cảm ứng để vẽ; các nút "Đặt vào giữa trang" cho phép thêm chữ, ngày, hộp kiểm, chữ ký bằng bàn phím.

## Giấy phép và thành phần bên thứ ba

pdf-lib (MIT), pdf.js (Apache-2.0), qpdf-wasm (ISC, qpdf: Apache-2.0), fflate (MIT), tesseract.js và dữ liệu ngôn ngữ (Apache-2.0, MIT), pptxgenjs (MIT), fast-xml-parser (MIT), utif2 (MIT), upng-js (MIT), jSquash AVIF (Apache-2.0), DejaVu Sans (Bitstream Vera/DejaVu, cho phép nhúng), Liberation Sans/Serif/Mono (OFL), Inter, Be Vietnam Pro, Dancing Script (OFL), lucide-react (ISC). Ứng dụng không dùng logo, tên, văn bản hay mã nguồn của bất kỳ sản phẩm tham chiếu nào.

## Ứng dụng máy tính (Windows, macOS, Linux)

Cùng một mã giao diện được đóng gói bằng Electron. Khác bản web ở chỗ lưu dữ liệu: siêu dữ liệu thư viện nằm trong **SQLite** (`library.sqlite`), nội dung tệp là **tệp thật** trong thư mục `blobs/` của thư mục dữ liệu ứng dụng (Linux `~/.config/Make it easier`, macOS `~/Library/Application Support/Make it easier`, Windows `%APPDATA%\Make it easier`). Không còn hạn mức của trình duyệt và trình duyệt không tự xóa dữ liệu; sao lưu bằng cách chép thư mục đó. Mọi xử lý vẫn chạy trên máy, không gửi tệp đi đâu.

```bash
npm run desktop:dev     # chạy thử với máy chủ Vite (tải lại nóng)
npm run desktop         # dựng giao diện rồi mở app
npm run dist:linux      # release/*.AppImage, .deb, .rpm
npm run dist:win        # release/*.exe (NSIS và portable) — nên dựng trên Windows
npm run dist:mac        # release/*.dmg, .zip (x64 và arm64) — phải dựng trên macOS
npm run test:desktop    # E2E Electron thật (cần màn hình); MIE_PACKAGED=<đường dẫn bản đóng gói> để thử bản đã đóng gói
```

Mỗi hệ điều hành nên dựng trên chính nó; workflow `.github/workflows/desktop.yml` dựng cả ba (chạy tay hoặc khi gắn tag `v*`) và đưa gói lên artifact. Bản dựng chưa ký số: macOS sẽ hỏi xác nhận lần đầu (chuột phải → Mở) và Windows SmartScreen có thể cảnh báo; muốn bỏ cảnh báo cần chứng chỉ ký của bạn (xem tài liệu electron-builder về `CSC_LINK`). SQLite dùng mô-đun `node:sqlite` có sẵn trong Electron nên không phải biên dịch mô-đun gốc theo từng nền tảng. Dữ liệu đã lưu ở bản web (IndexedDB của trình duyệt) không tự chuyển sang app; tải về từ web rồi thêm vào app.

### Cập nhật phiên bản trong app

Vào **Cài đặt** → *Kiểm tra bản mới*; app cũng tự kiểm tra một lần sau khi mở. Có bản mới thì bấm *Nâng cấp*: app tải về, rồi *Khởi động lại và cài đặt* (Windows và Linux AppImage). Trên macOS (chưa ký số) nút mở trang tải về để bạn thay app thủ công. Bản cập nhật lấy từ GitHub Releases của repo `TuanVuNguyen89/make-it-easier`, **repo phải công khai** (hoặc đặt bản phát hành ở một repo công khai khác) thì người dùng mới tải được. Mỗi lần phát hành: tăng `version` trong `package.json`, commit, `git tag vX.Y.Z && git push origin vX.Y.Z`; workflow dựng gói và các tệp `latest*.yml` mà app dùng để biết có bản mới. `.deb`/`.rpm` cập nhật qua trình quản lý gói của hệ điều hành hoặc tải gói mới.
