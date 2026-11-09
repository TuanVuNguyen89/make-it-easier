import { StandardFonts, degrees, rgb } from 'pdf-lib'
import { loadPdf, throwIfAborted } from '@/lib/pdf'
import { visualFrame } from '@/lib/pageGeometry'
import { parseRanges } from '@/lib/ranges'
import { ToolError, type RunFn } from '../types'

const MARGIN = 28 // điểm từ mép trang

interface Options {
  position: string
  format: 'n' | 'n-of-total'
  start: number
  size: number
  ranges: string
}

/** Đánh số theo vị trí trang trong tài liệu (trang thứ i hiển thị start + i - 1), đứng thẳng theo hướng nhìn thấy. */
export const run: RunFn<Options> = async (inputs, options, ctx) => {
  const doc = await loadPdf(inputs[0]!)
  const m = /^(top|bottom)-(left|center|right)$/.exec(options.position ?? '')
  const size = Number(options.size)
  const start = Number(options.start)
  if (!m || !(size >= 6 && size <= 48) || !Number.isInteger(start) || start < 0) {
    throw new ToolError('invalid-options', 'Bad page number options')
  }
  const [, vertical, horizontal] = m as unknown as [string, 'top' | 'bottom', 'left' | 'center' | 'right']
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const count = doc.getPageCount()
  const targets = options.ranges?.trim() ? parseRanges(options.ranges, count) : doc.getPageIndices()

  let done = 0
  for (const i of new Set(targets)) {
    throwIfAborted(ctx.signal)
    const page = doc.getPage(i)
    const n = start + i
    const text = options.format === 'n-of-total' ? `${n} / ${start + count - 1}` : String(n)
    const width = font.widthOfTextAtSize(text, size)
    const { vw, vh, rotation, toPage } = visualFrame(page)
    const anchorX = horizontal === 'left' ? MARGIN : horizontal === 'right' ? vw - MARGIN : vw / 2
    const vx = anchorX - (horizontal === 'left' ? 0 : horizontal === 'right' ? width : width / 2)
    const vy = vertical === 'bottom' ? MARGIN : vh - MARGIN - size
    const { x, y } = toPage(vx, vy)
    page.drawText(text, { x, y, size, font, color: rgb(0.1, 0.1, 0.1), rotate: degrees(rotation) })
    ctx.progress(++done / targets.length)
  }
  return [{ name: 'numbered.pdf', mime: 'application/pdf', data: await doc.save() }]
}
