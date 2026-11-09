import { PDFDocument, rgb } from 'pdf-lib'
import { wrapRuns, type Fonts } from './pdfLayout'
import type { Deck, TextShape } from './pptxRead'

const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50
/** Chọn cỡ chữ lớn nhất (không quá `max`) mà chữ vẫn nằm trong khung cao `h`. */
function fit(shape: TextShape, fonts: Fonts, w: number, h: number): { size: number; lines: { text: string; bold: boolean; marker: boolean }[] } {
  const base = shape.paras.find((p) => p.size)?.size ?? (shape.title ? 32 : 18)
  for (let size = base; size >= 8; size -= 1) {
    const lines: { text: string; bold: boolean; marker: boolean }[] = []
    for (const p of shape.paras) {
      const wrapped = wrapRuns([{ text: p.text, bold: p.bold || shape.title }], fonts, size, w - (p.bullet ? size : 0))
      wrapped.forEach((tokens, i) => lines.push({ text: tokens.map((t) => t.text).join(''), bold: !!(p.bold || shape.title), marker: !!p.bullet && i === 0 }))
    }
    if (lines.length * size * 1.25 <= h || size === 8) return { size, lines }
  }
  return { size: 8, lines: [] }
}

/** Vẽ từng slide thành một trang PDF cùng kích thước slide: ảnh và chữ đặt đúng vị trí; chữ tự thu nhỏ cho vừa khung. */
export async function drawDeck(doc: PDFDocument, fonts: Fonts, deck: Deck, tick: () => void) {
  for (const slide of deck.slides) {
    const page = doc.addPage([deck.width, deck.height])
    let cursor = 0.06 * deck.height // vị trí xếp chồng cho khung không có tọa độ (kế thừa từ layout)
    for (const s of slide.shapes) {
      if (s.type === 'image') {
        const img = isPng(s.data) ? await doc.embedPng(s.data) : await doc.embedJpg(s.data)
        page.drawImage(img, { x: s.x, y: deck.height - s.y - s.h, width: s.w, height: s.h })
        continue
      }
      const hasBox = [s.x, s.y, s.w, s.h].every(Number.isFinite)
      const box = hasBox
        ? { x: s.x, y: s.y, w: s.w, h: s.h }
        : { x: 0.06 * deck.width, y: cursor, w: 0.88 * deck.width, h: s.title ? 0.18 * deck.height : 0.6 * deck.height }
      if (!hasBox) cursor += box.h + 0.02 * deck.height
      const { size, lines } = fit(s, fonts, box.w - 8, box.h)
      const total = lines.length * size * 1.25
      let top = box.y + (s.anchor === 'ctr' ? Math.max(0, (box.h - total) / 2) : s.anchor === 'b' ? Math.max(0, box.h - total) : 0)
      for (const l of lines) {
        const font = l.bold ? fonts.bold : fonts.regular
        const x = box.x + 4 + (l.marker || s.paras.some((p) => p.bullet) ? size : 0)
        if (l.marker) page.drawText('•', { x: box.x + 4, y: deck.height - top - size, size, font: fonts.regular, color: rgb(0.1, 0.1, 0.1) })
        if (l.text.trim()) page.drawText(l.text, { x, y: deck.height - top - size, size, font, color: rgb(0.1, 0.1, 0.1) })
        top += size * 1.25
      }
    }
    tick()
  }
}

