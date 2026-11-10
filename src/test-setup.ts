import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { setQpdfWasmBinary } from '@/lib/qpdf'

setQpdfWasmBinary(new Uint8Array(readFileSync('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm')))
import { setUnicodeFontBytes } from '@/lib/fonts'

setUnicodeFontBytes(new Uint8Array(readFileSync('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf')))
setUnicodeFontBytes(new Uint8Array(readFileSync('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf')), 'bold')
setUnicodeFontBytes(new Uint8Array(readFileSync('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Oblique.ttf')), 'italic')
import { createCanvas, type Canvas } from '@napi-rs/canvas'
import { setRasterBackend } from '@/lib/pdfRaster'

// Test chạy trên Node: dùng pdf.js bản legacy và canvas native để vẽ trang thật.
setRasterBackend({
  loadPdfjs: () => import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as ReturnType<Parameters<typeof setRasterBackend>[0]['loadPdfjs']>,
  createCanvas: (w, h) => createCanvas(w, h),
  encode: async (canvas, format) => {
    const c = canvas as Canvas
    return new Uint8Array(format === 'png' ? await c.encode('png') : await c.encode('jpeg', 92))
  },
  assetsBase: 'node_modules/pdfjs-dist/',
})
import { loadImage } from '@napi-rs/canvas'
import { setImageBackend } from '@/lib/image'
import { setAvifWasmBinary } from '@/lib/avif'

setAvifWasmBinary(new Uint8Array(readFileSync('node_modules/@jsquash/avif/codec/enc/avif_enc.wasm')))
setImageBackend({
  async decode(bytes) {
    const img = await loadImage(Buffer.from(bytes))
    const c = createCanvas(img.width, img.height)
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, img.width, img.height)
    return { width: d.width, height: d.height, data: new Uint8ClampedArray(d.data) }
  },
  async encode(bm, format, quality) {
    const c = createCanvas(bm.width, bm.height)
    const g = c.getContext('2d')
    const id = g.createImageData(bm.width, bm.height)
    id.data.set(bm.data)
    g.putImageData(id, 0, 0)
    const out = format === 'png' ? await c.encode('png') : format === 'jpg' ? await c.encode('jpeg', quality) : await c.encode('webp', quality)
    return new Uint8Array(out)
  },
})

import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { setOcrBackend } from '@/lib/ocr'

// OCR trong test: gom dữ liệu ngôn ngữ vào một thư mục (tesseract.js nhận một langPath duy nhất).
const tessData = 'node_modules/.cache/tessdata-test'
if (!existsSync(`${tessData}/vie.traineddata.gz`) || !existsSync(`${tessData}/deu.traineddata.gz`)) {
  mkdirSync(tessData, { recursive: true })
  for (const l of ['eng', 'vie', 'deu']) cpSync(`node_modules/@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`, `${tessData}/${l}.traineddata.gz`)
}
setOcrBackend({ options: () => ({ langPath: tessData, gzip: true, cacheMethod: 'none' }) })

import { setFamilyFontBytes, type FamilyKey, type FaceStyle } from '@/lib/fonts'

// Phông tương đương (Liberation) cho test sửa chữ.
for (const family of ['sans', 'serif', 'mono'] as FamilyKey[]) {
  for (const style of ['regular', 'bold', 'italic', 'bolditalic'] as FaceStyle[]) {
    setFamilyFontBytes(family, style, new Uint8Array(readFileSync(`assets/fonts/${family}-${style}.ttf`)))
  }
}
