import { PDFDocument } from 'pdf-lib'
import { embedFonts } from '@/lib/office/pdfLayout'
import { readPptx } from '@/lib/office/pptxRead'
import { drawDeck } from '@/lib/office/slidePdf'
import { throwIfAborted } from '@/lib/pdf'
import type { RunFn } from '../types'

/** PPTX → PDF: mỗi slide một trang cùng kích thước, chữ và ảnh PNG/JPG đặt đúng vị trí. Không dựng lại nền, hiệu ứng, biểu đồ. */
export const run: RunFn<Record<string, never>> = async (inputs, _options, ctx) => {
  const deck = readPptx(inputs[0]!)
  const doc = await PDFDocument.create()
  let n = 0
  await drawDeck(doc, await embedFonts(doc), deck, () => {
    throwIfAborted(ctx.signal)
    ctx.progress(++n / deck.slides.length)
  })
  return [{ name: 'presentation.pdf', mime: 'application/pdf', data: await doc.save() }]
}
