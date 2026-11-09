import { PDFDocument } from 'pdf-lib'
import type { Annotation } from '@/lib/annotations'
import { decodeImage, encodeImage } from '@/lib/image'
import { fillRect } from '@/lib/imageOps'
import { visualFrame } from '@/lib/pageGeometry'
import { loadPdf, throwIfAborted } from '@/lib/pdf'
import { rasterizePdf } from '@/lib/pdfRaster'
import { ToolError, type RunFn } from '../types'

const DPI = 150
const K = DPI / 72

/**
 * Biên tập (redact) thật sự: mỗi trang có vùng che được vẽ ra ảnh, tô đen vùng che rồi thay trang bằng chính ảnh đó,
 * nên chữ và hình bên dưới không còn trong tệp (không chỉ bị phủ lên). Trang không có vùng che giữ nguyên dạng vector.
 * Đổi lại, trang bị biên tập thành ảnh (không chọn/tìm chữ được).
 */
export const run: RunFn<{ annotations: Annotation[] }> = async (inputs, options, ctx) => {
  const boxes = (options.annotations ?? []).filter((a): a is Extract<Annotation, { type: 'redact' }> => a.type === 'redact')
  if (boxes.length === 0) throw new ToolError('invalid-options', 'Mark at least one area to redact')
  const src = await loadPdf(inputs[0]!)
  const count = src.getPageCount()
  for (const b of boxes) {
    if (!Number.isInteger(b.page) || b.page < 0 || b.page >= count || ![b.x, b.y, b.w, b.h].every(Number.isFinite)) {
      throw new ToolError('invalid-options', 'Bad redaction area')
    }
  }
  const pages = [...new Set(boxes.map((b) => b.page))]

  const rendered = new Map<number, Uint8Array>()
  await rasterizePdf(inputs[0]!, { dpi: DPI, format: 'png', pages }, (i, _t, data) => {
    rendered.set(i, data)
    ctx.progress(0.7 * (rendered.size / pages.length))
  }, ctx.signal)

  const out = await PDFDocument.create()
  for (let i = 0; i < count; i++) {
    throwIfAborted(ctx.signal)
    const png = rendered.get(i)
    if (!png) {
      const [copy] = await out.copyPages(src, [i])
      out.addPage(copy!)
      continue
    }
    const bm = await decodeImage(png)
    for (const b of boxes.filter((x) => x.page === i)) fillRect(bm, b.x * K, b.y * K, b.w * K, b.h * K, [0, 0, 0, 255])
    const img = await out.embedPng(await encodeImage(bm, 'png'))
    // Giữ đúng kích thước nhìn thấy của trang gốc (ảnh làm tròn lên theo pixel nên không suy ngược từ ảnh).
    const { vw, vh } = visualFrame(src.getPage(i))
    const page = out.addPage([vw, vh])
    page.drawImage(img, { x: 0, y: 0, width: vw, height: vh })
    ctx.progress(0.7 + 0.3 * ((i + 1) / count))
  }
  return [{ name: 'redacted.pdf', mime: 'application/pdf', data: await out.save() }]
}
