import type { Block } from './office/blocks'
import { toLines, type Line, type PageText } from './pdfText'

const BULLET = /^([•·▪◦‣\-–*]|\d{1,3}[.)])\s+/

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[s.length >> 1]! : 11
}

/**
 * Dựng khối nội dung từ chữ của PDF: cỡ chữ lớn hơn cỡ thân bài nhiều thì là tiêu đề, dòng bắt đầu bằng dấu đầu dòng
 * hoặc số thứ tự là mục danh sách, các dòng liền nhau (khoảng cách dòng bình thường) gộp thành một đoạn văn.
 * Giữa các trang chèn ngắt trang.
 */
export function pagesToBlocks(pages: PageText[]): Block[] {
  // Cỡ thân bài: trung vị cỡ chữ theo số ký tự trên toàn tài liệu.
  const weights: number[] = []
  for (const p of pages) for (const r of p.runs) for (let i = 0; i < r.str.length; i++) weights.push(Math.round(r.size))
  const body = median(weights)

  const blocks: Block[] = []
  pages.forEach((page, pi) => {
    const lines = toLines(page.runs)
    let current: Line[] = []
    const flush = () => {
      if (!current.length) return
      const text = current.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim()
      if (text) blocks.push({ type: 'paragraph', runs: [{ text }] })
      current = []
    }
    for (const line of lines) {
      const ratio = line.size / body
      const prev = current.at(-1)
      if (ratio >= 1.25) {
        flush()
        blocks.push({ type: 'heading', level: ratio >= 1.8 ? 1 : ratio >= 1.4 ? 2 : 3, runs: [{ text: line.text }] })
        continue
      }
      if (BULLET.test(line.text)) {
        flush()
        const m = BULLET.exec(line.text)!
        blocks.push({ type: 'list', marker: /\d/.test(m[1]!) ? m[1]! : '•', level: 0, runs: [{ text: line.text.slice(m[0].length) }] })
        continue
      }
      // Dòng mới thuộc đoạn đang có nếu cách dòng trước vừa phải và cùng cỡ chữ; ngược lại mở đoạn mới.
      if (prev && (line.y - prev.y > prev.size * 1.9 || Math.abs(line.size - prev.size) > 1.5)) flush()
      current.push(line)
    }
    flush()
    if (pi < pages.length - 1) blocks.push({ type: 'pageBreak' })
  })
  return blocks
}

/** Dựng lưới ô từ chữ của một trang: dòng → hàng; trong dòng, chữ cách xa nhau là các ô; cột lấy theo mép trái ô. */
export function pageToGrid(page: PageText): string[][] {
  const lines = toLines(page.runs)
  const rows: { x: number; text: string }[][] = lines.map((l) => {
    const cells: { x: number; text: string; end: number }[] = []
    for (const r of l.runs) {
      const last = cells.at(-1)
      if (last && r.x - last.end <= Math.max(l.size * 1.5, 10)) {
        last.text += (r.x - last.end > l.size * 0.2 && !last.text.endsWith(' ') ? ' ' : '') + r.str
        last.end = r.x + r.w
      } else cells.push({ x: r.x, text: r.str, end: r.x + r.w })
    }
    return cells.map((c) => ({ x: c.x, text: c.text.trim() }))
  })
  // Cột: gom mép trái các ô (sai số 8 pt).
  const starts = rows.flat().map((c) => c.x).sort((a, b) => a - b)
  const cols: number[] = []
  for (const x of starts) if (!cols.length || x - cols.at(-1)! > 8) cols.push(x)
  return rows.map((cells) => {
    const out = Array<string>(cols.length).fill('')
    for (const c of cells) {
      let best = 0
      cols.forEach((cx, i) => { if (Math.abs(cx - c.x) < Math.abs(cols[best]! - c.x)) best = i })
      out[best] = out[best] ? `${out[best]} ${c.text}` : c.text
    }
    return out
  })
}
