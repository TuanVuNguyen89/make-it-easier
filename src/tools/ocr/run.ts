import { PDFDocument } from 'pdf-lib'
import { loadUnicodeFont } from '@/lib/fonts'
import { decodeImage, encodeImage } from '@/lib/image'
import { OCR_LANGUAGES, recognizeImages, type OcrLanguage } from '@/lib/ocr'
import { loadPdf } from '@/lib/pdf'
import { rasterizePdf } from '@/lib/pdfRaster'
import { addInvisibleText } from '@/lib/textLayer'
import { ToolError, type RunFn } from '../types'

const PDF_DPI = 200
const IMG_DPI = 150 // kích thước trang cho ảnh đầu vào: 1 pixel = 72/150 điểm
const MAX_PAGE_PT = 1200

const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46
const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
const isJpg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8

/**
 * OCR cục bộ (tesseract.js) cho PDF quét hoặc ảnh, xuất PDF có thể tìm kiếm và chọn chữ.
 * PDF: giữ nguyên nội dung từng trang và chỉ thêm lớp chữ vô hình. Ảnh: tạo PDF một trang gồm ảnh và lớp chữ.
 * Không nhận ra chữ nào: báo 'no-text' và không tạo tệp (đầu ra sẽ giống hệt đầu vào).
 */
export const run: RunFn<{ language: OcrLanguage }> = async (inputs, options, ctx) => {
  if (!OCR_LANGUAGES.includes(options.language)) throw new ToolError('invalid-options', 'Bad OCR language')
  const bytes = inputs[0]!

  if (isPdf(bytes)) {
    const doc = await loadPdf(bytes)
    const count = doc.getPageCount()
    const images: Uint8Array[] = []
    await rasterizePdf(bytes, { dpi: PDF_DPI, format: 'png' }, (_i, total, data) => {
      images.push(data)
      ctx.progress(0.3 * (images.length / total))
    }, ctx.signal)
    const words = await recognizeImages(images, options.language, (f) => ctx.progress(0.3 + 0.6 * f), ctx.signal)
    if (words.every((w) => w.length === 0)) throw new ToolError('no-text', 'No text recognized')
    const fontkit = (await import('@pdf-lib/fontkit')).default
    doc.registerFontkit(fontkit)
    const font = await doc.embedFont(await loadUnicodeFont(), { subset: true })
    for (let i = 0; i < count; i++) addInvisibleText(doc.getPage(i), words[i] ?? [], PDF_DPI / 72, font)
    return [{ name: 'ocr.pdf', mime: 'application/pdf', data: await doc.save() }]
  }

  const bm = await decodeImage(bytes)
  const png = await encodeImage(bm, 'png')
  const [words] = await recognizeImages([png], options.language, (f) => ctx.progress(0.9 * f), ctx.signal)
  if (!words || words.length === 0) throw new ToolError('no-text', 'No text recognized')

  const out = await PDFDocument.create()
  const fontkit = (await import('@pdf-lib/fontkit')).default
  out.registerFontkit(fontkit)
  const font = await out.embedFont(await loadUnicodeFont(), { subset: true })
  const img = isPng(bytes) ? await out.embedPng(bytes) : isJpg(bytes) ? await out.embedJpg(bytes) : await out.embedPng(png)
  const fit = Math.min(1, MAX_PAGE_PT / ((Math.max(bm.width, bm.height) * 72) / IMG_DPI))
  const w = ((bm.width * 72) / IMG_DPI) * fit
  const h = ((bm.height * 72) / IMG_DPI) * fit
  const page = out.addPage([w, h])
  page.drawImage(img, { x: 0, y: 0, width: w, height: h })
  addInvisibleText(page, words, bm.width / w, font)
  ctx.progress(1)
  return [{ name: 'ocr.pdf', mime: 'application/pdf', data: await out.save() }]
}
