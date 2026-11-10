import { loadPdf, throwIfAborted } from './pdf'
import { visualFrame } from './pageGeometry'
import { findGraphics } from './pdfGraphics'
import { pageImages, type ExtractedImage } from './pdfImages'
import { layoutPage } from './pdfRichLayout'
import { pageOpStyles } from './pdfFontStyle'
import { readPageContent } from './pdfPageContent'
import { extractPdfText } from './pdfText'
import { decodeImage } from './image'
import { crop } from './imageOps'
import { encodePng } from './pdfImages'
import { findFigures } from './scanFigures'
import type { RichPage } from './office/richModel'

export interface RichResult {
  pages: RichPage[]
  /** Số ảnh không đưa được vào (loại mã hóa chưa hỗ trợ). */
  skippedImages: number
  /** Số ảnh quét thay bằng chữ OCR. */
  scanImagesRemoved: number
  hasText: boolean
}

/** PDF → các trang có định dạng (chữ, bảng, ảnh, cột) để ghi DOCX. */
export async function pdfToRichPages(bytes: Uint8Array, signal: AbortSignal, onProgress?: (fraction: number) => void): Promise<RichResult> {
  const pages = await extractPdfText(bytes, signal, (d, t) => onProgress?.(0.5 * (d / t)))
  const doc = await loadPdf(bytes)
  // Cỡ thân bài: trung vị cỡ chữ theo số ký tự trên toàn tài liệu.
  const sizes: number[] = []
  for (const p of pages) for (const r of p.runs) for (let i = 0; i < r.str.length; i++) sizes.push(Math.round(r.size))
  sizes.sort((a, b) => a - b)
  const bodySize = sizes[sizes.length >> 1] ?? 11

  const cache = new Map<string, ExtractedImage | null>()
  let skipped = 0
  const out: RichPage[] = []
  for (let i = 0; i < pages.length; i++) {
    throwIfAborted(signal)
    const page = doc.getPage(i)
    const content = readPageContent(doc, i)
    const imgs = pageImages(doc, i, cache)
    const frame = visualFrame(page)
    const graphics = content ? findGraphics(content, (x, y) => frame.toVisual(x, y), imgs.isImage) : { segs: [], fills: [], images: [] }
    const placed: { img: ExtractedImage; key: string; x: number; y: number; w: number; h: number }[] = []
    for (const im of graphics.images) {
      const img = imgs.get(im.name)
      if (img) placed.push({ img, key: imgs.key(im.name), x: im.x, y: im.y, w: im.w, h: im.h })
      else if (im.w >= 3 && im.h >= 3) skipped++
    }
    const rich = layoutPage({ text: pages[i]!, styles: pageOpStyles(doc, i), graphics, images: placed }, { bodySize })
    // Trang quét đã OCR: ảnh quét bị bỏ (chữ đã thành chữ thật) nhưng hình minh họa trong đó được cắt ra giữ lại.
    if (rich.scan) {
      for (const im of rich.scan.images) {
        try {
          const bm = await decodeImage(im.data)
          const sx = bm.width / im.w
          const sy = bm.height / im.h
          const boxes = rich.scan.textBoxes.map((b) => ({ x0: (b.x0 - im.x) * sx, y0: (b.y0 - im.y) * sy, x1: (b.x1 - im.x) * sx, y1: (b.y1 - im.y) * sy }))
          findFigures(bm, boxes).forEach((f, k) => {
            const part = crop(bm, f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0)
            const rgb = new Uint8Array(part.width * part.height * 3)
            for (let p = 0; p < part.width * part.height; p++) { rgb[p * 3] = part.data[p * 4]!; rgb[p * 3 + 1] = part.data[p * 4 + 1]!; rgb[p * 3 + 2] = part.data[p * 4 + 2]! }
            rich.images.push({ key: `fig:${im.key}:${i}:${k}`, data: encodePng(rgb, part.width, part.height, 3), ext: 'png', x: im.x + f.x0 / sx, y: im.y + f.y0 / sy, w: (f.x1 - f.x0) / sx, h: (f.y1 - f.y0) / sy, behind: false })
          })
        } catch {
          /* không đọc được ảnh quét: bỏ qua việc giữ hình */
        }
      }
      delete rich.scan
    }
    out.push(rich)
    onProgress?.(0.5 + 0.5 * ((i + 1) / pages.length))
  }
  return { pages: out, skippedImages: skipped, scanImagesRemoved: out.reduce((n, p) => n + p.scanImagesRemoved, 0), hasText: pages.some((p) => p.runs.length > 0) }
}
