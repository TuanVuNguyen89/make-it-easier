import { TextRenderingMode, degrees, popGraphicsState, pushGraphicsState, setTextRenderingMode, type PDFFont, type PDFPage } from 'pdf-lib'
import { visualFrame } from './pageGeometry'
import type { OcrWord } from './ocr'

/**
 * Thêm lớp chữ vô hình (chế độ vẽ chữ 3) lên trang: người dùng chọn, tìm và sao chép được chữ, còn hình ảnh
 * bên dưới giữ nguyên. `pxPerPt` là số pixel ảnh trên mỗi điểm PDF theo hướng nhìn thấy của trang.
 */
export function addInvisibleText(page: PDFPage, words: OcrWord[], pxPerPt: number, font: PDFFont): number {
  const f = visualFrame(page)
  let n = 0
  for (const w of words) {
    const x = w.x0 / pxPerPt
    const widthPt = (w.x1 - w.x0) / pxPerPt
    const heightPt = (w.y1 - w.y0) / pxPerPt
    const w1 = font.widthOfTextAtSize(w.text, 1)
    if (!(w1 > 0) || !(widthPt > 0) || !(heightPt > 0)) continue
    // Chọn cỡ chữ để chiều rộng chữ khớp khung từ (vùng chọn trùng với chữ trên ảnh), giới hạn theo chiều cao khung.
    const size = Math.min(Math.max(widthPt / w1, heightPt * 0.5), heightPt * 1.4)
    const baseline = w.y1 / pxPerPt - heightPt * 0.2
    const p = f.toPage(x, f.vh - baseline)
    page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible))
    page.drawText(w.text, { x: p.x, y: p.y, size, font, rotate: degrees(f.rotation) })
    page.pushOperators(popGraphicsState())
    n++
  }
  return n
}
