import { PDFDocument } from 'pdf-lib'
import { loadPdf, throwIfAborted } from '@/lib/pdf'
import { parseRanges } from '@/lib/ranges'
import type { RunFn } from '../types'

export const run: RunFn<{ ranges: string }> = async (inputs, options, ctx) => {
  const src = await loadPdf(inputs[0]!)
  const indices = parseRanges(options.ranges ?? '', src.getPageCount())
  throwIfAborted(ctx.signal)
  const out = await PDFDocument.create()
  for (const p of await out.copyPages(src, indices)) out.addPage(p)
  ctx.progress(1)
  return [{ name: 'extracted.pdf', mime: 'application/pdf', data: await out.save() }]
}
