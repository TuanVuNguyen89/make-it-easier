// Sao chép tài nguyên pdf.js (phông chuẩn, cmap, wasm) vào public/pdfjs để tự host, dùng được offline.
import { cp, mkdir, readdir } from 'node:fs/promises'

const src = 'node_modules/pdfjs-dist'
const dest = 'public/pdfjs'
await mkdir(dest, { recursive: true })
for (const dir of ['standard_fonts', 'cmaps', 'wasm', 'iccs']) {
  await cp(`${src}/${dir}`, `${dest}/${dir}`, { recursive: true })
}

// Tesseract (OCR): worker, lõi wasm (chỉ biến thể LSTM) và dữ liệu tiếng Việt, tiếng Anh. Tự host để chạy cục bộ/offline.
const tess = 'public/tesseract'
await mkdir(`${tess}/core`, { recursive: true })
await mkdir(`${tess}/lang`, { recursive: true })
await cp('node_modules/tesseract.js/dist/worker.min.js', `${tess}/worker.min.js`)
for (const f of await readdir('node_modules/tesseract.js-core')) {
  if (/-lstm\.(js|wasm|wasm\.js)$/.test(f)) await cp(`node_modules/tesseract.js-core/${f}`, `${tess}/core/${f}`)
}
for (const lang of ['eng', 'vie']) {
  await cp(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `${tess}/lang/${lang}.traineddata.gz`)
}

// Phông tương đương cho tính năng sửa chữ (Liberation: như Arial / Times New Roman / Courier New, đủ tiếng Việt). Xem assets/fonts/README.md.
await mkdir('public/fonts', { recursive: true })
for (const f of await readdir('assets/fonts')) if (f.endsWith('.ttf')) await cp(`assets/fonts/${f}`, `public/fonts/${f}`)
