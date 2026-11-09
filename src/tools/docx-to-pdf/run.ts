import { PDFDocument } from 'pdf-lib'
import { readDocx } from '@/lib/office/docxRead'
import { Flow, embedFonts } from '@/lib/office/pdfLayout'
import { throwIfAborted } from '@/lib/pdf'
import type { RunFn } from '../types'

/** DOCX → PDF mức nội dung: tiêu đề, đoạn văn (đậm/nghiêng), danh sách, bảng, ngắt trang. Không dựng lại bố cục phức tạp. */
export const run: RunFn<Record<string, never>> = async (inputs, _options, ctx) => {
  const blocks = readDocx(inputs[0]!)
  while (blocks.at(-1)?.type === 'pageBreak') blocks.pop() // không để trang trắng ở cuối
  const doc = await PDFDocument.create()
  const flow = new Flow(doc, await embedFonts(doc))
  blocks.forEach((b, i) => {
    throwIfAborted(ctx.signal)
    flow.block(b)
    ctx.progress((i + 1) / blocks.length)
  })
  return [{ name: 'document.pdf', mime: 'application/pdf', data: await doc.save() }]
}
