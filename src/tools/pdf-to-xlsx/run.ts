import { writeXlsx } from '@/lib/office/xlsxWrite'
import type { Sheet } from '@/lib/office/xlsxRead'
import { extractPdfText } from '@/lib/pdfText'
import { pageToGrid } from '@/lib/pdfStructure'
import { ToolError, type RunFn } from '../types'

/** Chuỗi chỉ gồm chữ số (có thể có dấu và phần thập phân dấu chấm) thì thành số; số có 0 đứng đầu (mã) giữ nguyên là chữ. */
export const asCell = (s: string): string | number => (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s) ? Number(s) : s)

/** PDF → XLSX: mỗi trang có chữ thành một trang tính; dòng chữ → hàng, chữ cách xa nhau → các ô, cột theo mép trái. */
export const run: RunFn<Record<string, never>> = async (inputs, _options, ctx) => {
  const pages = await extractPdfText(inputs[0]!, ctx.signal, (d, t) => ctx.progress(0.9 * (d / t)))
  const sheets: Sheet[] = []
  pages.forEach((p, i) => {
    if (p.runs.length === 0) return
    sheets.push({ name: `Trang ${i + 1}`, rows: pageToGrid(p).map((r) => r.map(asCell)) })
  })
  if (sheets.length === 0) throw new ToolError('no-text-layer', 'PDF has no text layer')
  return [{ name: 'tables.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: writeXlsx(sheets) }]
}
