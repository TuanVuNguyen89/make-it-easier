import { qpdfError, runQpdf } from '@/lib/qpdf'
import { ToolError, type RunFn } from '../types'

/**
 * Nén không mất chất lượng: chỉ tối ưu cấu trúc (luồng nén, object streams); không đụng đến ảnh.
 * Nếu kết quả không nhỏ hơn bản gốc thì báo 'no-reduction' và không xuất file (spec FR-006).
 */
export const run: RunFn<Record<string, never>> = async (inputs, _options, ctx) => {
  const input = inputs[0]!
  if (ctx.signal.aborted) throw new ToolError('aborted')
  const res = await runQpdf(['--object-streams=generate', '--recompress-flate', '--compression-level=9'], input)
  if (!res.output) throw await qpdfError(inputs[0]!, res.stderr, false)
  if (res.output.byteLength >= input.byteLength) throw new ToolError('no-reduction', 'Already optimized')
  ctx.progress(1)
  return [{ name: 'compressed.pdf', mime: 'application/pdf', data: res.output }]
}
