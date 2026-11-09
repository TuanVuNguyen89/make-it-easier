import { writeDocx } from '@/lib/office/docxWrite'
import { extractPdfText } from '@/lib/pdfText'
import { pagesToBlocks } from '@/lib/pdfStructure'
import { ToolError, type RunFn } from '../types'

/**
 * PDF → DOCX theo nội dung: tiêu đề (theo cỡ chữ), đoạn văn (các dòng liền nhau gộp lại), danh sách, ngắt trang.
 * Không giữ nguyên bố cục, phông chữ hay ảnh. PDF quét (không có lớp chữ) cần OCR trước.
 */
export const run: RunFn<Record<string, never>> = async (inputs, _options, ctx) => {
  const pages = await extractPdfText(inputs[0]!, ctx.signal, (d, t) => ctx.progress(0.9 * (d / t)))
  const blocks = pagesToBlocks(pages)
  if (!blocks.some((b) => b.type !== 'pageBreak')) throw new ToolError('no-text-layer', 'PDF has no text layer')
  return [{ name: 'document.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: writeDocx(blocks) }]
}
