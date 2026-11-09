import { qpdfError, runQpdf } from '@/lib/qpdf'
import { ToolError, type RunFn } from '../types'

/** Đặt mật khẩu mở file (AES-256). Mật khẩu chủ trùng mật khẩu mở để người dùng chỉ cần nhớ một mật khẩu. */
export const run: RunFn<{ password: string }> = async (inputs, options, ctx) => {
  const password = options.password ?? ''
  if (!password) throw new ToolError('invalid-options', 'Password is required')
  if (ctx.signal.aborted) throw new ToolError('aborted')
  const res = await runQpdf(
    ['--encrypt', `--user-password=${password}`, `--owner-password=${password}`, '--bits=256', '--'],
    inputs[0]!,
  )
  if (!res.output) throw await qpdfError(inputs[0]!, res.stderr, false)
  ctx.progress(1)
  return [{ name: 'protected.pdf', mime: 'application/pdf', data: res.output }]
}
