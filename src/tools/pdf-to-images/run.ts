import { rasterizePdf } from '@/lib/pdfRaster'
import { ToolError, type RunFn, type ToolOutput } from '../types'

export const run: RunFn<{ format: 'png' | 'jpg'; dpi: string | number }> = async (inputs, options, ctx) => {
  const dpi = Number(options.dpi)
  if (!['png', 'jpg'].includes(options.format) || ![72, 150, 300].includes(dpi)) {
    throw new ToolError('invalid-options', 'Bad image options')
  }
  const outputs: ToolOutput[] = []
  await rasterizePdf(
    inputs[0]!,
    { dpi, format: options.format },
    (index, total, data) => {
      outputs.push({
        name: `page-${index + 1}.${options.format}`,
        mime: options.format === 'png' ? 'image/png' : 'image/jpeg',
        data,
      })
      ctx.progress((index + 1) / total)
    },
    ctx.signal,
  )
  return outputs
}
