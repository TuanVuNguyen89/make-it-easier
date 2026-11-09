import { PDFDocument } from 'pdf-lib'
import { loadPdf, throwIfAborted } from '@/lib/pdf'
import type { RunFn } from '../types'

export const run: RunFn<Record<string, never>> = async (inputs, _options, ctx) => {
  const out = await PDFDocument.create()
  for (let i = 0; i < inputs.length; i++) {
    throwIfAborted(ctx.signal)
    const src = await loadPdf(inputs[i]!)
    const pages = await out.copyPages(src, src.getPageIndices())
    for (const p of pages) out.addPage(p)
    ctx.progress((i + 1) / inputs.length)
  }
  throwIfAborted(ctx.signal)
  return [{ name: 'merged.pdf', mime: 'application/pdf', data: await out.save() }]
}
