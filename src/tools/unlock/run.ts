import { qpdfError, runQpdf } from '@/lib/qpdf'
import { ToolError, type RunFn } from '../types'

/** Gỡ mật khẩu: cần mật khẩu đúng; sai thì không tạo file. */
export const run: RunFn<{ password: string }> = async (inputs, options, ctx) => {
  const password = options.password ?? ''
  if (ctx.signal.aborted) throw new ToolError('aborted')
  const res = await runQpdf([`--password=${password}`, '--decrypt'], inputs[0]!)
  if (!res.output) throw await qpdfError(inputs[0]!, res.stderr, true)
  ctx.progress(1)
  return [{ name: 'unlocked.pdf', mime: 'application/pdf', data: res.output }]
}
