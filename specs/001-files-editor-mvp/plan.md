# Implementation Plan: Files Editor MVP

**Branch**: `001-files-editor-mvp` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

## Summary

SPA chạy hoàn toàn trên trình duyệt. Thư viện lưu trong IndexedDB; các công cụ PDF là module thuần chạy trong Web Worker.

## Technical Context

**Language**: TypeScript 5 (strict)
**UI**: React 18, Vite, React Router, Tailwind CSS, i18next
**State**: Zustand; truy cập lưu trữ qua `idb`
**PDF**: `pdf-lib` (gộp/tách/xoay/xóa/crop/số trang/hình mờ/ảnh→PDF), `pdfjs-dist` (render thumbnail, PDF→ảnh), qpdf-wasm (mật khẩu, nén) hoặc thay thế được đánh giá ở Phase 0
**Archive**: `fflate` (zip nhiều ảnh, đọc/ghi gói OOXML)
**Mở rộng (US5–US8)**: ảnh = bộ đệm RGBA thuần JS + codec canvas/`utif2`/`upng-js`/`@jsquash/avif`; OCR = `tesseract.js` (dữ liệu tự host); Office = `fast-xml-parser` + `fflate` (đọc), ghi DOCX/XLSX thủ công, `pptxgenjs` (ghi PPTX); chú thích = SVG overlay + `pdf-lib`
**Test**: Vitest (module công cụ), Playwright (luồng UI)
**Platform**: trình duyệt hiện đại, triển khai tĩnh
**Constraints**: không upload nội dung file; tác vụ nặng trong Worker; tải lười WASM

## Constitution Check

| Nguyên tắc | Đạt | Ghi chú |
|---|---|---|
| Client-side, privacy-first | Có | Không có backend trong MVP |
| Công cụ là module thuần | Có | `src/tools/<id>/run.ts` |
| Không phá hủy bản gốc | Có | Output luôn là Document mới |
| Worker, có tiến trình/hủy | Có | `src/workers/toolRunner.ts` |
| Không dùng tài sản site gốc | Có | Tự thiết kế UI |

## Project Structure

```
docs/research/                  # khảo sát nghiệp vụ
specs/001-files-editor-mvp/     # spec, plan, tasks
src/
  app/                          # router, layout, sidebar
  features/library/             # thư viện, thư mục, thùng rác, tìm kiếm
  features/tools/               # danh mục, trang chạy công cụ chung
  tools/<tool-id>/              # meta.ts (schema tham số), run.ts (thuần), run.test.ts
  workers/toolRunner.ts         # chạy công cụ, báo tiến trình, hủy
  storage/                      # IndexedDB: documents, folders, blobs, runs
  i18n/                         # vi, en
tests/fixtures/                 # PDF mẫu: thường, nhiều trang, có mật khẩu, hỏng
tests/e2e/
```

## Quyết định thiết kế chính

1. **Giao diện công cụ khai báo**: mỗi tool có `meta.ts` (id, nhóm, input, schema tham số). Một trang `ToolPage` dựng form từ schema, nên thêm công cụ mới không cần viết UI mới.
2. **Hợp đồng công cụ**: `run(inputs: Uint8Array[], options, ctx{progress, signal}) => Promise<Output[]>`.
3. **Lưu trữ**: bảng `documents` (metadata) tách khỏi `blobs`, để liệt kê nhanh không đọc nội dung.
4. **Thùng rác**: cờ `deletedAt`, dọn vĩnh viễn thủ công.

## Phase 0: Nghiên cứu

- Chọn thư viện nén và mật khẩu chạy được trong trình duyệt (qpdf-wasm so với giải pháp khác). Đầu ra: ghi chú quyết định kèm đo kích thước/tốc độ trên file mẫu.
- Xác nhận giới hạn bộ nhớ khi gộp file lớn.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Nén PDF chỉ tối ưu cấu trúc nên có thể giảm ít | Không render lại ảnh; hiển thị dung lượng trước/sau, báo rõ khi không giảm được |
| Mã hóa PDF trong pdf-lib hạn chế | Dùng qpdf-wasm |
| Hết quota IndexedDB | Báo lỗi sớm, kiểm tra `navigator.storage.estimate()` |
| Phạm vi phình to | Giữ OCR/convert Office/redact ngoài MVP |
