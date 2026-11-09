import { loadPdf } from '@/lib/pdf'
import { runQpdf } from '@/lib/qpdf'
import { ToolError, type RunFn } from '../types'

/**
 * Sửa PDF lỗi cấu trúc (bảng xref/startxref sai, offset lệch, thiếu trailer, tệp bị cắt đuôi, rác ở đầu...).
 * Bản wasm của qpdf không tự dựng lại được xref trong các ca này, còn pdf-lib đọc tuần tự các object và bỏ qua
 * bảng xref nên đọc được; ta nạp bằng pdf-lib rồi ghi lại để có xref mới sạch, rồi để qpdf (đọc nghiêm ngặt)
 * làm trọng tài: tệp xuất ra phải qua `qpdf --check`. PDF mất nội dung hoặc không phải PDF thì báo lỗi, không tạo tệp.
 */
export const run: RunFn<Record<string, never>> = async (inputs, _options, ctx) => {
  if (ctx.signal.aborted) throw new ToolError('aborted')
  const doc = await loadPdf(inputs[0]!) // ném 'encrypted' hoặc 'invalid-pdf'
  if (doc.getPageCount() === 0) throw new ToolError('invalid-pdf', 'No pages could be recovered')
  const saved = await doc.save()
  const check = await runQpdf(['--check'], saved, { noOutput: true })
  if (check.code === 2) throw new ToolError('invalid-pdf', 'Repaired file is still damaged')
  ctx.progress(1)
  return [{ name: 'repaired.pdf', mime: 'application/pdf', data: saved }]
}
