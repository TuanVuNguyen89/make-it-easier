import { loadPdf } from '@/lib/pdf'
import { parseRanges } from '@/lib/ranges'
import { ToolError, type RunFn } from '../types'

export const run: RunFn<{ ranges: string }> = async (inputs, options, ctx) => {
  const doc = await loadPdf(inputs[0]!)
  const remove = new Set(parseRanges(options.ranges ?? '', doc.getPageCount()))
  if (remove.size >= doc.getPageCount()) throw new ToolError('invalid-options', 'Cannot delete every page')
  // Xóa từ cuối lên để chỉ số không bị lệch.
  for (const i of [...remove].sort((a, b) => b - a)) doc.removePage(i)
  ctx.progress(1)
  return [{ name: 'pages-deleted.pdf', mime: 'application/pdf', data: await doc.save() }]
}
