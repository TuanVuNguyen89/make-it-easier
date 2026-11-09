import { degrees } from 'pdf-lib'
import { loadPdf } from '@/lib/pdf'
import { parseRanges } from '@/lib/ranges'
import { ToolError, type RunFn } from '../types'

export const run: RunFn<{ ranges: string; angle: string | number }> = async (inputs, options, ctx) => {
  const doc = await loadPdf(inputs[0]!)
  const angle = Number(options.angle)
  if (![90, 180, 270].includes(angle)) throw new ToolError('invalid-options', 'Bad angle')
  // Bỏ trống = xoay tất cả các trang.
  const targets = options.ranges?.trim() ? parseRanges(options.ranges, doc.getPageCount()) : doc.getPageIndices()
  for (const i of new Set(targets)) {
    const page = doc.getPage(i)
    page.setRotation(degrees((page.getRotation().angle + angle) % 360))
  }
  ctx.progress(1)
  return [{ name: 'rotated.pdf', mime: 'application/pdf', data: await doc.save() }]
}
