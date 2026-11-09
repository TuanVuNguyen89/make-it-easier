import { PDFDocument, rgb } from 'pdf-lib'
import type { Fonts } from './pdfLayout'
import { cellText, type Sheet } from './xlsxRead'

const PAGE = { width: 841.89, height: 595.28, margin: 40 } // A4 ngang
const SIZE = 10
const PAD = 4
const MAX_COL = 220

/** Vẽ các trang tính thành bảng: bề rộng cột theo nội dung, cột quá rộng thì chia sang nhóm trang kế tiếp. */
export function drawSheets(doc: PDFDocument, fonts: Fonts, sheets: Sheet[], tick: () => void) {
  const lh = SIZE * 1.4
  const usable = PAGE.width - 2 * PAGE.margin
  for (const sheet of sheets) {
    const rows = sheet.rows.filter((r) => r.some((c) => c !== ''))
    if (rows.length === 0) continue
    const cols = Math.max(...rows.map((r) => r.length))
    const widths = Array.from({ length: cols }, (_, c) =>
      Math.min(MAX_COL, Math.max(28, ...rows.map((r) => fonts.regular.widthOfTextAtSize(cellText(r[c] ?? ''), SIZE) + 2 * PAD))),
    )
    // Gom cột thành các nhóm vừa chiều ngang trang.
    const groups: number[][] = []
    let cur: number[] = []
    let w = 0
    widths.forEach((cw, c) => {
      if (cur.length && w + cw > usable) {
        groups.push(cur)
        cur = []
        w = 0
      }
      cur.push(c)
      w += cw
    })
    if (cur.length) groups.push(cur)

    for (const group of groups) {
      let page = doc.addPage([PAGE.width, PAGE.height])
      let y = PAGE.height - PAGE.margin
      const title = group === groups[0] ? sheet.name : `${sheet.name} (…)`
      page.drawText(title, { x: PAGE.margin, y: y - 12, size: 12, font: fonts.bold, color: rgb(0.1, 0.1, 0.1) })
      y -= 26
      for (const row of rows) {
        if (y - lh - 2 * PAD < PAGE.margin) {
          page = doc.addPage([PAGE.width, PAGE.height])
          y = PAGE.height - PAGE.margin
        }
        let x = PAGE.margin
        for (const c of group) {
          const v = row[c] ?? ''
          page.drawRectangle({ x, y: y - lh - 2 * PAD, width: widths[c]!, height: lh + 2 * PAD, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 })
          let text = cellText(v)
          while (text.length > 1 && fonts.regular.widthOfTextAtSize(text, SIZE) > widths[c]! - 2 * PAD) text = text.slice(0, -1) // cột bị giới hạn: cắt bớt
          if (text) {
            const tw = fonts.regular.widthOfTextAtSize(text, SIZE)
            // số căn phải, chữ căn trái (giống bảng tính)
            const tx = typeof v === 'number' ? x + widths[c]! - PAD - tw : x + PAD
            page.drawText(text, { x: tx, y: y - PAD - SIZE, size: SIZE, font: fonts.regular, color: rgb(0.1, 0.1, 0.1) })
          }
          x += widths[c]!
        }
        y -= lh + 2 * PAD
      }
      tick()
    }
  }
}
