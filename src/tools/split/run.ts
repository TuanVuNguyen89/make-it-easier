import { PDFDocument } from 'pdf-lib'
import { loadPdf, throwIfAborted } from '@/lib/pdf'
import { parseRangeGroups } from '@/lib/ranges'
import type { RunFn, ToolOutput } from '../types'

interface Options {
  mode: 'ranges' | 'each'
  ranges: string
}

export const run: RunFn<Options> = async (inputs, options, ctx) => {
  const src = await loadPdf(inputs[0]!)
  const count = src.getPageCount()
  const groups =
    options.mode === 'each'
      ? src.getPageIndices().map((i) => [i])
      : parseRangeGroups(options.ranges ?? '', count)

  const outputs: ToolOutput[] = []
  for (let g = 0; g < groups.length; g++) {
    throwIfAborted(ctx.signal)
    const out = await PDFDocument.create()
    for (const p of await out.copyPages(src, groups[g]!)) out.addPage(p)
    outputs.push({ name: `part-${g + 1}.pdf`, mime: 'application/pdf', data: await out.save() })
    ctx.progress((g + 1) / groups.length)
  }
  return outputs
}
