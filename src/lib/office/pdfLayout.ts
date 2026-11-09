import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { loadUnicodeFont } from '@/lib/fonts'
import type { Block, Run } from './blocks'

export interface Fonts {
  regular: PDFFont
  bold: PDFFont
  italic: PDFFont
}

export async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  const fontkit = (await import('@pdf-lib/fontkit')).default
  doc.registerFontkit(fontkit)
  const [regular, bold, italic] = await Promise.all(
    (['regular', 'bold', 'italic'] as const).map(async (w) => doc.embedFont(await loadUnicodeFont(w), { subset: true })),
  )
  return { regular: regular!, bold: bold!, italic: italic! }
}

export const fontFor = (f: Fonts, r: { bold?: boolean; italic?: boolean }) => (r.bold ? f.bold : r.italic ? f.italic : f.regular)

interface Token {
  text: string
  font: PDFFont
}

/** Chia các đoạn chữ thành dòng vừa bề rộng, ngắt theo từ (từ quá dài thì ngắt theo ký tự). */
export function wrapRuns(runs: Run[], fonts: Fonts, size: number, maxWidth: number): Token[][] {
  const lines: Token[][] = [[]]
  let width = 0
  const push = (t: Token) => {
    lines[lines.length - 1]!.push(t)
    width += t.font.widthOfTextAtSize(t.text, size)
  }
  const newline = () => {
    lines.push([])
    width = 0
  }
  for (const run of runs) {
    const font = fontFor(fonts, run)
    run.text.split('\n').forEach((part, li) => {
      if (li > 0) newline()
      for (const word of part.split(/(?<= )/)) {
        const w = font.widthOfTextAtSize(word, size)
        const fit = width + font.widthOfTextAtSize(word.trimEnd(), size) <= maxWidth
        if (!fit && width > 0) newline()
        if (w <= maxWidth || word.trim() === '') push({ text: word, font })
        else {
          let rest = word
          while (rest.length) {
            let cut = rest.length
            while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth - width) cut--
            push({ text: rest.slice(0, cut), font })
            rest = rest.slice(cut)
            if (rest.length) newline()
          }
        }
      }
    })
  }
  return lines
}

export interface PageBox {
  width: number
  height: number
  margin: number
}

/** Dàn khối nội dung lên các trang PDF theo luồng từ trên xuống. */
export class Flow {
  page!: PDFPage
  y = 0
  constructor(readonly doc: PDFDocument, readonly fonts: Fonts, readonly box: PageBox = { width: 595.28, height: 841.89, margin: 56 }) {
    this.newPage()
  }
  get contentWidth() {
    return this.box.width - 2 * this.box.margin
  }
  newPage() {
    this.page = this.doc.addPage([this.box.width, this.box.height])
    this.y = this.box.height - this.box.margin
  }
  private ensure(h: number) {
    if (this.y - h < this.box.margin) this.newPage()
  }

  text(runs: Run[], size: number, opts: { indent?: number; before?: number; after?: number; marker?: string } = {}) {
    const indent = opts.indent ?? 0
    const lh = size * 1.35
    this.y -= opts.before ?? 0
    const lines = wrapRuns(runs, this.fonts, size, this.contentWidth - indent)
    lines.forEach((tokens, i) => {
      this.ensure(lh)
      this.y -= lh
      if (i === 0 && opts.marker) this.page.drawText(opts.marker, { x: this.box.margin + indent - 16, y: this.y + size * 0.25, size, font: this.fonts.regular, color: rgb(0.1, 0.1, 0.1) })
      let x = this.box.margin + indent
      for (const t of tokens) {
        if (t.text.trim()) this.page.drawText(t.text, { x, y: this.y + size * 0.25, size, font: t.font, color: rgb(0.1, 0.1, 0.1) })
        x += t.font.widthOfTextAtSize(t.text, size)
      }
    })
    this.y -= opts.after ?? 0
  }

  table(rows: string[][], size = 10) {
    const cols = Math.max(...rows.map((r) => r.length))
    if (!cols) return
    const pad = 4
    // Bề rộng cột tỉ lệ theo nội dung dài nhất (có giới hạn dưới), thu về vừa bề rộng trang.
    const want = Array.from({ length: cols }, (_, c) => Math.max(36, ...rows.map((r) => this.fonts.regular.widthOfTextAtSize(r[c] ?? '', size) + 2 * pad)))
    const total = want.reduce((a, b) => a + b, 0)
    const widths = want.map((w) => (total > this.contentWidth ? (w / total) * this.contentWidth : w))
    const lh = size * 1.3
    for (const row of rows) {
      const cells = widths.map((w, c) => wrapRuns([{ text: row[c] ?? '' }], this.fonts, size, w - 2 * pad))
      const h = Math.max(...cells.map((l) => l.length)) * lh + 2 * pad
      this.ensure(h)
      let x = this.box.margin
      cells.forEach((lines, c) => {
        this.page.drawRectangle({ x, y: this.y - h, width: widths[c]!, height: h, borderColor: rgb(0.55, 0.55, 0.55), borderWidth: 0.5 })
        lines.forEach((tokens, li) => {
          const text = tokens.map((t) => t.text).join('')
          if (text.trim()) this.page.drawText(text, { x: x + pad, y: this.y - pad - (li + 1) * lh + size * 0.3, size, font: this.fonts.regular, color: rgb(0.1, 0.1, 0.1) })
        })
        x += widths[c]!
      })
      this.y -= h
    }
    this.y -= 8
  }

  block(b: Block) {
    switch (b.type) {
      case 'heading': {
        const size = b.level === 1 ? 22 : b.level === 2 ? 17 : 14
        this.text(b.runs.map((r) => ({ ...r, bold: true })), size, { before: 10, after: 6 })
        break
      }
      case 'paragraph':
        this.text(b.runs, 11, { after: 6 })
        break
      case 'list':
        this.text(b.runs, 11, { indent: 22 + b.level * 18, marker: b.marker, after: 2 })
        break
      case 'table':
        this.table(b.rows)
        break
      case 'pageBreak':
        this.newPage()
        break
    }
  }
}
