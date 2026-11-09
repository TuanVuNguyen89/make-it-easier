import { PDFDocument, degrees } from 'pdf-lib'
import { loadPdf, throwIfAborted } from '@/lib/pdf'
import { ToolError, type RunFn } from '../types'

export interface PageSpec {
  /** Chỉ số trang gốc, từ 0. */
  src: number
  /** Góc xoay thêm vào, bội số của 90. */
  rotate: number
}

/** Dựng PDF mới từ danh sách trang theo thứ tự cuối cùng (đã sắp xếp lại, xóa, xoay). */
export const run: RunFn<{ pages: PageSpec[] }> = async (inputs, options, ctx) => {
  const src = await loadPdf(inputs[0]!)
  const specs = options.pages
  if (!Array.isArray(specs) || specs.length === 0) throw new ToolError('invalid-options', 'No pages left')
  for (const s of specs) {
    if (!Number.isInteger(s.src) || s.src < 0 || s.src >= src.getPageCount() || s.rotate % 90 !== 0) {
      throw new ToolError('invalid-options', 'Bad page spec')
    }
  }
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, specs.map((s) => s.src))
  copied.forEach((page, i) => {
    throwIfAborted(ctx.signal)
    const extra = ((specs[i]!.rotate % 360) + 360) % 360
    if (extra) page.setRotation(degrees((page.getRotation().angle + extra) % 360))
    out.addPage(page)
  })
  ctx.progress(1)
  return [{ name: 'organized.pdf', mime: 'application/pdf', data: await out.save() }]
}
