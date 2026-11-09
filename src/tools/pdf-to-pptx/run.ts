import { rasterizePdf } from '@/lib/pdfRaster'
import { extractPdfText, toLines } from '@/lib/pdfText'
import { throwIfAborted } from '@/lib/pdf'
import type { RunFn } from '../types'

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * PDF → PPTX: mỗi trang thành một slide có ảnh trang (giữ nguyên hình thức), kèm chữ của trang trong phần ghi chú
 * để không mất nội dung. Slide không chỉnh sửa được từng phần tử (là ảnh).
 */
export const run: RunFn<Record<string, never>> = async (inputs, _options, ctx) => {
  const bytes = inputs[0]!
  const images: Uint8Array[] = []
  const sizes: { width: number; height: number }[] = []
  const texts = await extractPdfText(bytes, ctx.signal, (d, t) => ctx.progress(0.2 * (d / t)))
  texts.forEach((p) => sizes.push({ width: p.width, height: p.height }))
  await rasterizePdf(bytes, { dpi: 150, format: 'jpg' }, (_i, total, data) => {
    images.push(data)
    ctx.progress(0.2 + 0.6 * (images.length / total))
  }, ctx.signal)

  const PptxGenJS = (await import('pptxgenjs')).default
  const pres = new PptxGenJS()
  // Kích thước slide theo trang đầu (inch); các trang khác co vừa khung.
  const w = sizes[0]!.width / 72
  const h = sizes[0]!.height / 72
  pres.defineLayout({ name: 'PDF_PAGE', width: w, height: h })
  pres.layout = 'PDF_PAGE'
  images.forEach((img, i) => {
    throwIfAborted(ctx.signal)
    const slide = pres.addSlide()
    const pw = sizes[i]!.width / 72
    const ph = sizes[i]!.height / 72
    const k = Math.min(w / pw, h / ph)
    slide.addImage({ data: `image/jpeg;base64,${toBase64(img)}`, x: (w - pw * k) / 2, y: (h - ph * k) / 2, w: pw * k, h: ph * k })
    const notes = toLines(texts[i]!.runs).map((l) => l.text).join('\n')
    if (notes) slide.addNotes(notes)
  })
  const out = (await pres.write({ outputType: 'uint8array' })) as Uint8Array
  ctx.progress(1)
  return [{ name: 'slides.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', data: out }]
}
