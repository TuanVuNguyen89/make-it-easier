# Files Editor Constitution

## Core Principles

### I. Privacy-first, client-side by default
File của người dùng được xử lý trong trình duyệt và lưu cục bộ (IndexedDB/OPFS). MVP không gửi nội dung file đến server nào. Mọi ngoại lệ phải được ghi trong plan và người dùng đồng ý rõ ràng.

### II. Mỗi công cụ độc lập, kiểm thử được
Mỗi công cụ PDF là một module thuần (input bytes + options → output bytes), không phụ thuộc UI. Có test với file mẫu thật. UI chỉ là lớp mỏng gọi module.

### III. Không phá hủy dữ liệu gốc
Công cụ luôn tạo file mới hoặc phiên bản mới, không ghi đè bản gốc trừ khi người dùng chọn rõ. Xóa đi qua thùng rác trước khi xóa vĩnh viễn.

### IV. Tải nhanh, xử lý không chặn UI
Tác vụ nặng chạy trong Web Worker, có tiến trình và hủy được. Thư viện nặng (WASM) tải lười khi dùng đến.

### V. Sản phẩm tự thiết kế
Chỉ mô phỏng nghiệp vụ. Không dùng logo, tên, văn bản marketing hay mã nguồn của site tham chiếu.

## Ràng buộc kỹ thuật
TypeScript strict, Vite + React, pnpm hoặc npm, Vitest + Playwright. Giao diện đa ngôn ngữ, mặc định tiếng Việt.

## Quy trình
Spec → Plan → Tasks → Implement theo spec-kit. Mỗi user story giao được và demo được độc lập.

**Version**: 1.0.0 | **Ratified**: 2026-11-09
