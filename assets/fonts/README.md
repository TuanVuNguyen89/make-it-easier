# Phông tương đương dùng khi sửa chữ trên PDF

Liberation Sans, Liberation Serif, Liberation Mono (Red Hat/Google, giấy phép SIL Open Font License 1.1 — xem `LICENSE-Liberation.txt`).
Chúng tương thích số đo với Arial, Times New Roman và Courier New, có đủ tiếng Việt, và cắt phông con (subset) đúng với fontkit/pdf-lib.

Tên tệp: `<họ>-<kiểu>.ttf` với họ = sans | serif | mono (Sans, Serif, Mono) và kiểu = regular | bold | italic | bolditalic.
`npm run assets` chép chúng vào `public/fonts/` để trình duyệt tải khi dùng.

Đã thử Arimo/Tinos/Cousine (Google Fonts): fontkit cắt phông con làm hỏng chúng (chữ vô hình hoặc mất glyph), nên không dùng.
