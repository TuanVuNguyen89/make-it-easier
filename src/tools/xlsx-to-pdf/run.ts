import { PDFDocument } from 'pdf-lib'
import { embedFonts } from '@/lib/office/pdfLayout'
import { drawSheets } from '@/lib/office/sheetPdf'
import { readXlsx } from '@/lib/office/xlsxRead'
import { throwIfAborted } from '@/lib/pdf'
import { ToolError, type RunFn } from '../types'

/** XLSX → PDF: mỗi trang tính thành bảng (giá trị đã tính của công thức), cột rộng thì chia sang trang kế. Không giữ định dạng ô. */
export const run: RunFn<Record<string, never>> = async (inputs, _options, ctx) => {
  const sheets = readXlsx(inputs[0]!)
  const doc = await PDFDocument.create()
  let n = 0
  drawSheets(doc, await embedFonts(doc), sheets, () => {
    throwIfAborted(ctx.signal)
    ctx.progress(Math.min(0.99, ++n / (sheets.length * 2)))
  })
  if (doc.getPageCount() === 0) throw new ToolError('invalid-office', 'Workbook has no data')
  return [{ name: 'workbook.pdf', mime: 'application/pdf', data: await doc.save() }]
}
