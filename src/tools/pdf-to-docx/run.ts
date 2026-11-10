import { writeRichDocx } from '@/lib/office/docxRich'
import { pdfToRichPages } from '@/lib/pdfToRich'
import { ToolError, type RunFn } from '../types'

/**
 * PDF → DOCX giữ định dạng: phông, cỡ, màu, đậm/nghiêng, gạch chân, căn lề, thụt dòng và khoảng cách, danh sách, bảng
 * (có đường kẻ hoặc cột thẳng hàng), cột chữ, đường kẻ ngang và ảnh đặt đúng chỗ trên từng trang. Đoạn văn được gộp lại để
 * sửa được trong Word. Chỉ là xấp xỉ (phông trong PDF thường không đưa lại được nên Word dùng phông tương đương);
 * PDF quét (không có lớp chữ) cần OCR trước.
 */
export const run: RunFn<Record<string, never>> = async (inputs, _options, ctx) => {
  const r = await pdfToRichPages(inputs[0]!, ctx.signal, (f) => ctx.progress(0.9 * f))
  if (!r.hasText) throw new ToolError('no-text-layer', 'PDF has no text layer')
  return [
    {
      name: 'document.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: writeRichDocx(r.pages),
      warnings: r.skippedImages || r.scanImagesRemoved ? [...(r.skippedImages ? ['docx-images-skipped'] : []), ...(r.scanImagesRemoved ? ['docx-scan-image-removed'] : [])] : undefined,
    },
  ]
}
