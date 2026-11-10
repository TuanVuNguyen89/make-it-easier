import type { ExtractedImage } from './pdfImages'
import type { FillRect, PageGraphics, RGB, Seg } from './pdfGraphics'
import type { OpStyle } from './pdfFontStyle'
import { toLines, type PageText, type TextRun } from './pdfText'
import type { RichCell, RichColumn, RichElement, RichImage, RichPage, RichParagraph, RichRun, RichTable, TabStop } from './office/richModel'

/**
 * Dựng bố cục có định dạng của một trang PDF để ghi ra DOCX: đoạn văn (phông, cỡ, màu, đậm/nghiêng, căn lề, thụt dòng,
 * khoảng cách), danh sách, bảng (có đường kẻ hoặc cột thẳng hàng), cột chữ, đường kẻ ngang và ảnh.
 * Vị trí dọc được giữ bằng cách đặt chiều cao dòng cố định và tính khoảng cách phía trên từ vị trí thật trong PDF.
 */

export interface PageInput {
  text: PageText
  styles: OpStyle[]
  graphics: PageGraphics
  images: { img: ExtractedImage; key: string; x: number; y: number; w: number; h: number }[]
}

interface SRun extends TextRun {
  font: string
  family: 'sans' | 'serif' | 'mono'
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
  /** Chữ vô hình (Tr 3): lớp chữ OCR đặt trên ảnh quét. */
  invisible: boolean
}

/** Phần dưới đường cơ sở của một dòng cao `lineHeight` với cỡ chữ `size`: Word đặt đường cơ sở cách đáy dòng cố định này. */
export const DESCENT = 0.21
// Ký tự vùng riêng (U+E000–F8FF) là dấu đầu dòng của phông Symbol/Wingdings (ví dụ U+F0B7).
const MARKER_ONLY = /^([•·▪◦‣○●■□▫–—\-*\uE000-\uF8FF]|\d{1,3}[.)])$/
const MARKER_START = /^([•·▪◦‣○●■□▫–—\-*\uE000-\uF8FF]|\d{1,3}[.)])\s+/
const hex = (c: RGB | null) => (c ? c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase() : '000000')
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[s.length >> 1]! : 0
}
const isWhiteish = (c: RGB | null) => !c || (c[0] > 0.95 && c[1] > 0.95 && c[2] > 0.95)

// ---------- Phông ----------
const KNOWN: [RegExp, string][] = [
  [/^(arial|arimo|helvetica|liberationsans)/, 'Arial'],
  [/^(timesnewroman|times|tinos|liberationserif)/, 'Times New Roman'],
  [/^(couriernew|courier|cousine|liberationmono)/, 'Courier New'],
  [/^calibri/, 'Calibri'], [/^cambria/, 'Cambria'], [/^verdana/, 'Verdana'], [/^tahoma/, 'Tahoma'], [/^georgia/, 'Georgia'],
  [/^segoeui/, 'Segoe UI'], [/^trebuchet/, 'Trebuchet MS'], [/^consolas/, 'Consolas'], [/^garamond/, 'Garamond'],
  [/^palatino/, 'Palatino Linotype'], [/^bookantiqua/, 'Book Antiqua'], [/^centurygothic/, 'Century Gothic'],
]
/** Tên phông cho Word: bỏ tiền tố tập con và hậu tố kiểu (Bold, Italic...), ánh xạ tên quen thuộc. */
export function wordFontName(name: string | undefined, family: 'sans' | 'serif' | 'mono'): string {
  const fallback = family === 'serif' ? 'Times New Roman' : family === 'mono' ? 'Courier New' : 'Arial'
  if (!name) return fallback
  const base = name.replace(/^[A-Z]{6}\+/, '').split(/[-,]/)[0]!.replace(/(MT|PS)$/, '')
  const key = base.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const [re, w] of KNOWN) if (re.test(key)) return w
  const spaced = base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim()
  return spaced || fallback
}

function styleRuns(runs: TextRun[], ops: OpStyle[], segs: Seg[]): SRun[] {
  // Chia các lệnh vẽ chữ theo hàng (làm tròn y) để tra nhanh.
  const buckets = new Map<number, OpStyle[]>()
  for (const op of ops) {
    const k = Math.round(op.y)
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k)!.push(op)
  }
  const near = (y: number, tol: number) => {
    const out: OpStyle[] = []
    for (let k = Math.floor(y - tol); k <= Math.ceil(y + tol); k++) for (const op of buckets.get(k) ?? []) if (Math.abs(op.y - y) <= tol) out.push(op)
    return out
  }
  const hsegs = segs.filter((s) => Math.abs(s.y1 - s.y2) <= 1.2)
  return runs.map((r) => {
    const cands = near(r.y, Math.max(2, r.size * 0.35))
    // Lệnh đứng ngay trước (hoặc tại) điểm bắt đầu của đoạn; không có thì lệnh gần nhất phía sau.
    let best: OpStyle | undefined
    for (const op of cands) if (op.x <= r.x + 1.5 && (!best || op.x > best.x)) best = op
    if (!best) for (const op of cands) if (!best || op.x < best.x) best = op
    const f = best?.font
    const family = f?.family ?? 'sans'
    const underline = hsegs.some((s) => {
      const y = (s.y1 + s.y2) / 2
      const x0 = Math.min(s.x1, s.x2)
      const x1 = Math.max(s.x1, s.x2)
      return y > r.y + 0.3 && y < r.y + r.size * 0.3 + 2 && x1 - x0 <= r.w * 1.2 + 4 && Math.min(x1, r.x + r.w) - Math.max(x0, r.x) >= r.w * 0.6
    })
    return { ...r, font: wordFontName(f?.name, family), family, bold: f?.bold ?? false, italic: f?.italic ?? false, underline, color: hex(best?.fill ?? [0, 0, 0]), invisible: best?.invisible ?? false }
  })
}

// ---------- Dòng và đoạn ----------
interface PLine {
  /** Mép phải của vùng chứa dòng (để biết dòng đã "đầy" chưa khi vùng hẹp hơn cả cột). */
  limit?: number
  runs: SRun[]
  x: number
  end: number
  y: number
  size: number
}
const toPLine = (rs: SRun[]): PLine => {
  const runs = [...rs].sort((a, b) => a.x - b.x)
  return { runs, x: runs[0]!.x, end: Math.max(...runs.map((r) => r.x + r.w)), y: runs[0]!.y, size: Math.max(...runs.map((r) => r.size)) }
}

const sameStyle = (a: RichRun, b: RichRun) =>
  a.font === b.font && a.size === b.size && a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.color === b.color
const richRun = (r: SRun, text: string): RichRun => ({ text, font: r.font, family: r.family, size: Math.round(r.size * 2) / 2, bold: r.bold, italic: r.italic, underline: r.underline, color: r.color })
function pushRun(out: RichRun[], run: RichRun) {
  if (!run.text) return
  const last = out.at(-1)
  if (last && last.text !== '\t' && run.text !== '\t' && sameStyle(last, run)) last.text += run.text
  else out.push(run)
}

/** Nội dung một dòng: khoảng trắng theo khoảng cách thật; cách quá xa thì dùng tab (bỏ dấu tab ở mép phải bằng tab phải). */
function lineContent(runs: SRun[], boxLeft: number, boxRight: number, from = 0, singleSpace = false): { runs: RichRun[]; tabs: TabStop[]; hasTab: boolean } {
  const out: RichRun[] = []
  const tabs: TabStop[] = []
  let prevEnd = 0
  runs.forEach((r, i) => {
    if (i < from) return
    let text = r.str
    if (i === from) text = text.replace(/^\s+/, '')
    else {
      const gap = r.x - prevEnd
      const prev = runs[i - 1]!
      // Trang OCR: khoảng trống giữa chừng thường là từ bị bỏ sót (hoặc dòng căn đều), không phải cột nên không dùng tab.
      if (gap > Math.max(3 * r.size, 24) && !singleSpace) {
        const lastRun = i === runs.length - 1
        const end = r.x + r.w
        tabs.push(lastRun && Math.abs(end - boxRight) <= 4 && r.x - boxLeft > 0 ? { pos: boxRight - boxLeft, kind: 'right' } : { pos: r.x - boxLeft, kind: 'left' })
        pushRun(out, { ...richRun(prev, '\t') })
        text = text.replace(/^\s+/, '')
      } else if (gap > r.size * 0.2 && !/\s$/.test(prev.str) && !/^\s/.test(text)) {
        pushRun(out, richRun(prev, singleSpace ? ' ' : ' '.repeat(Math.max(1, Math.round(gap / (r.size * 0.28))))))
      }
    }
    pushRun(out, richRun(r, text))
    prevEnd = r.x + r.w
  })
  const last = out.at(-1)
  if (last && last.text !== '\t') last.text = last.text.replace(/\s+$/, '')
  return { runs: out, tabs, hasTab: tabs.length > 0 }
}

interface Box {
  x0: number
  x1: number
}
interface Elem {
  el: RichElement
  top: number
  bottom: number
}
interface Marker {
  text: string
  /** Mép trái của dấu và mép trái của chữ sau dấu. */
  x: number
  textX: number
}

/** Dấu đầu dòng/số thứ tự ở đầu dòng (dấu tách riêng hoặc dính liền chữ). */
// Trang OCR hay đọc dấu đầu dòng thành ký hiệu lạ («, ø, +, °...): chấp nhận mọi ký hiệu đơn (không chữ, không số, không dấu ngoặc/nháy).
const LOOSE_MARKER = /^([^\p{L}\p{N}\s"'“”‘’([{<]|o)$/u
function detectMarker(line: PLine, loose = false): { marker: Marker; from: number; cut: number } | null {
  const [a, b] = line.runs
  if (!a) return null
  if ((MARKER_ONLY.test(a.str.trim()) || (loose && LOOSE_MARKER.test(a.str.trim()))) && b && b.x - (a.x + a.w) <= a.size * 2.5 && b.x > a.x) return { marker: { text: a.str.trim(), x: a.x, textX: b.x }, from: 1, cut: 0 }
  const m = MARKER_START.exec(a.str)
  if (m) {
    const textX = a.x + (a.w * m[0].length) / Math.max(1, a.str.length)
    return { marker: { text: m[1]!, x: a.x, textX }, from: 0, cut: m[0].length }
  }
  return null
}

function alignOf(lines: PLine[], box: Box, pageCenter: number | null, ocr = false): 'left' | 'center' | 'right' | 'both' {
  const L = box.x0
  const R = lines[0]?.limit ?? box.x1
  const mid = (L + R) / 2
  if (lines.length === 1) {
    const l = lines[0]!
    const c = (l.x + l.end) / 2
    if (l.x - L > 12 && R - l.end > 12 && (Math.abs(c - mid) <= 4 || (pageCenter !== null && Math.abs(c - pageCenter) <= 4))) return 'center'
    // Trang OCR: dòng cuối của đoạn căn đều sát mép phải trông như căn phải nhưng không phải.
    if (!ocr && R - l.end <= 3 && l.x - L > 12) return 'right'
    return 'left'
  }
  const centers = lines.map((l) => (l.x + l.end) / 2)
  if (Math.max(...centers) - Math.min(...centers) <= 3 && Math.max(...lines.map((l) => l.x)) - Math.min(...lines.map((l) => l.x)) > 6) return 'center'
  const body = lines.slice(0, -1)
  const maxEnd = Math.max(...body.map((l) => l.end))
  const minX = Math.min(...lines.map((l) => l.x))
  if (body.every((l) => maxEnd - l.end <= 2.5) && body.length >= 1 && lines.at(-1)!.end <= maxEnd + 2 && Math.abs(lines[1]!.x - minX) <= 2 && R - maxEnd <= 6) return 'both'
  return 'left'
}

interface Ctx {
  /** Trang quét đã OCR (chữ vô hình): khoảng trắng đơn, dấu đầu dòng đoán rộng hơn. */
  ocr: boolean
  bodySize: number
  pageCenter: number | null
  fills: FillRect[]
}

/** Gom dòng thành đoạn và dựng đoạn văn cho một vùng (cột hoặc ô bảng). `top` là mép trên của vùng, để tính khoảng cách đầu tiên. */
function paragraphsFor(lines: PLine[], box: Box, ctx: Ctx): Elem[] {
  const elems: Elem[] = []
  interface Group { lines: PLine[]; marker?: Marker; from: number; cut: number; tabbed: boolean }
  const groups: Group[] = []
  let cur: Group | null = null
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x)
  for (const line of sorted) {
    const mk = detectMarker(line, ctx.ocr)
    const content = lineContent(line.runs, box.x0, box.x1, mk?.from ?? 0, ctx.ocr)
    const tabbed = content.hasTab
    let merge = false
    if (cur && !mk && !tabbed && !cur.tabbed) {
      const prev = cur.lines.at(-1)!
      const pitch = line.y - prev.y
      const bodyLeft = cur.marker ? cur.marker.textX : cur.lines.length > 1 ? cur.lines[1]!.x : prev.x
      const sizeOk = Math.abs(line.size - prev.size) <= 1.2
      const leftOk = Math.abs(line.x - bodyLeft) <= 3 || (cur.lines.length === 1 && !cur.marker && prev.x - line.x >= 4 && prev.x - line.x <= 40)
      // Dòng trước đã "đầy": từ đầu tiên của dòng sau không còn chỗ ở cuối dòng trước (ước lượng bề rộng từ cỡ ký tự trung bình);
      // nếu còn chỗ thì dòng sau là xuống dòng chủ ý (mục riêng) chứ không phải chữ tự xuống dòng.
      const prevChars = prev.runs.reduce((n, r) => n + r.str.length, 0)
      const avg = Math.max(1, (prev.end - prev.x) / Math.max(1, prevChars))
      const nextWord = line.runs.map((r) => r.str).join(' ').trim().split(/\s+/)[0] ?? ''
      const full = (prev.limit ?? box.x1) - prev.end < avg * (nextWord.length + 1.5)
      merge = pitch >= prev.size * 0.8 && pitch <= prev.size * 1.75 && sizeOk && leftOk && full
    }
    if (merge) cur!.lines.push(line)
    else {
      cur = { lines: [line], marker: mk?.marker, from: mk?.from ?? 0, cut: mk?.cut ?? 0, tabbed }
      groups.push(cur)
    }
  }
  for (const g of groups) {
    const first = g.lines[0]!
    const runs: RichRun[] = []
    const tabs: TabStop[] = []
    g.lines.forEach((l, i) => {
      const c = lineContent(l.runs, box.x0, box.x1, i === 0 ? g.from : 0, ctx.ocr)
      if (i === 0 && g.cut) {
        const firstRun = c.runs[0]
        if (firstRun && firstRun.text.startsWith(g.marker!.text)) firstRun.text = firstRun.text.slice(g.cut)
      }
      const prevText = runs.at(-1)?.text ?? ''
      if (i > 0 && prevText) {
        const joinNoSpace = /[A-Za-zÀ-ỹ]-$/.test(prevText) && /^[a-zà-ỹ]/.test(c.runs[0]?.text ?? '')
        if (!joinNoSpace && !/\s$/.test(prevText)) pushRun(runs, { ...runs.at(-1)!, text: ' ' })
      }
      for (const r of c.runs) pushRun(runs, r)
      if (i === 0) tabs.push(...c.tabs)
    })
    if (!runs.some((r) => r.text.trim() || r.text === '\t')) continue
    const sizes = first.runs.map((r) => r.size)
    const size = Math.max(...sizes)
    const pitches = g.lines.slice(1).map((l, i) => l.y - g.lines[i]!.y)
    const lineHeight = Math.max(size, pitches.length ? median(pitches) : size * 1.2)
    const bodyLeft = g.marker ? g.marker.textX : g.lines.length > 1 ? Math.min(...g.lines.slice(1).map((l) => l.x)) : first.x
    const align = g.marker || g.tabbed ? 'left' : alignOf(g.lines, box, ctx.pageCenter, ctx.ocr)
    const para: RichParagraph = {
      type: 'p',
      runs,
      align,
      indentLeft: Math.max(0, (align === 'left' || align === 'both' ? bodyLeft : box.x0) - box.x0),
      indentRight: 0,
      firstLine: 0,
      before: 0,
      lineHeight,
      tabs,
    }
    if (g.marker) {
      const num = /\d+/.exec(g.marker.text)
      para.list = { kind: num ? 'decimal' : 'bullet', suffix: g.marker.text.endsWith(')') ? ')' : '.', start: num ? Number(num[0]) : undefined }
      para.indentLeft = Math.max(0, g.marker.textX - box.x0)
      para.firstLine = -Math.max(0, Math.min(para.indentLeft, g.marker.textX - g.marker.x))
    } else if (align === 'left' && g.lines.length > 1 && first.x - bodyLeft >= 4) {
      para.firstLine = first.x - bodyLeft
    } else if (align === 'left' || align === 'both') {
      para.indentLeft = Math.max(0, first.x - box.x0)
    }
    if (align === 'center' || align === 'right') para.indentLeft = 0
    if (g.lines.length === 1 && align === 'left' && !tabs.length) para.noWrap = true
    if (first.limit !== undefined) para.wrapTo = first.limit
    if (size / ctx.bodySize >= 1.25 && !g.marker) para.outline = size / ctx.bodySize >= 1.8 ? 1 : size / ctx.bodySize >= 1.4 ? 2 : 3
    // Màu nền phía sau chữ (băng rôn): lấy ô tô màu nhỏ nhất chứa điểm giữa dòng đầu.
    const cx = (first.x + first.end) / 2
    const cy = first.y - size * 0.3
    const bg = ctx.fills.filter((f) => !isWhiteish(f.color) && cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h).sort((a, b) => a.w * a.h - b.w * b.h)[0]
    if (bg) para.shade = hex(bg.color)
    const top = first.y - (lineHeight - DESCENT * size)
    elems.push({ el: para, top, bottom: top + lineHeight * g.lines.length })
  }
  return elems
}

// ---------- Bảng có đường kẻ ----------
interface H { y: number; x0: number; x1: number; width: number; color: RGB | null }
interface V { x: number; y0: number; y1: number; width: number; color: RGB | null }

function mergeAxis<T extends { width: number; color: RGB | null }>(items: (T & { pos: number; a: number; b: number })[]): (T & { pos: number; a: number; b: number })[] {
  const sorted = [...items].sort((p, q) => p.pos - q.pos || p.a - q.a)
  const out: typeof sorted = []
  for (const it of sorted) {
    const last = out.at(-1)
    if (last && Math.abs(last.pos - it.pos) <= 1.2 && it.a <= last.b + 1.5) {
      last.b = Math.max(last.b, it.b)
      last.width = Math.max(last.width, it.width)
    } else out.push({ ...it })
  }
  return out
}

function clusterEdges(vals: number[], tol = 2.5): number[] {
  const s = [...vals].sort((a, b) => a - b)
  const out: number[][] = []
  for (const v of s) {
    const last = out.at(-1)
    if (last && v - last.at(-1)! <= tol) last.push(v)
    else out.push([v])
  }
  return out.map((g) => g.reduce((a, b) => a + b, 0) / g.length)
}

interface Grid {
  xs: number[]
  ys: number[]
  hs: H[]
  vs: V[]
  border: { width: number; color: string }
}

function findGrids(segs: Seg[]): Grid[] {
  // Trang có hàng nghìn nét (biểu đồ, bản đồ, hình vẽ) thì không phải bảng: bỏ qua để không tốn thời gian.
  if (segs.length > 4000) return []
  const hsRaw: (H & { pos: number; a: number; b: number })[] = []
  const vsRaw: (V & { pos: number; a: number; b: number })[] = []
  for (const s of segs) {
    const dx = Math.abs(s.x2 - s.x1)
    const dy = Math.abs(s.y2 - s.y1)
    if (dy <= 1.2 && dx >= 5) hsRaw.push({ y: (s.y1 + s.y2) / 2, x0: Math.min(s.x1, s.x2), x1: Math.max(s.x1, s.x2), width: s.width, color: s.color, pos: (s.y1 + s.y2) / 2, a: Math.min(s.x1, s.x2), b: Math.max(s.x1, s.x2) })
    else if (dx <= 1.2 && dy >= 5) vsRaw.push({ x: (s.x1 + s.x2) / 2, y0: Math.min(s.y1, s.y2), y1: Math.max(s.y1, s.y2), width: s.width, color: s.color, pos: (s.x1 + s.x2) / 2, a: Math.min(s.y1, s.y2), b: Math.max(s.y1, s.y2) })
  }
  const hs: H[] = mergeAxis(hsRaw).map((h) => ({ y: h.pos, x0: h.a, x1: h.b, width: h.width, color: h.color }))
  const vs: V[] = mergeAxis(vsRaw).map((v) => ({ x: v.pos, y0: v.a, y1: v.b, width: v.width, color: v.color }))
  // Thành phần liên thông: đoạn ngang và dọc chạm nhau.
  const n = hs.length + vs.length
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
  const T = 2.5
  hs.forEach((h, i) => vs.forEach((v, j) => {
    if (v.x >= h.x0 - T && v.x <= h.x1 + T && h.y >= v.y0 - T && h.y <= v.y1 + T) parent[find(i)] = find(hs.length + j)
  }))
  const comps = new Map<number, { hs: H[]; vs: V[] }>()
  hs.forEach((h, i) => { const k = find(i); if (!comps.has(k)) comps.set(k, { hs: [], vs: [] }); comps.get(k)!.hs.push(h) })
  vs.forEach((v, j) => { const k = find(hs.length + j); if (!comps.has(k)) comps.set(k, { hs: [], vs: [] }); comps.get(k)!.vs.push(v) })
  const grids: Grid[] = []
  for (const c of comps.values()) {
    const xs = clusterEdges(c.vs.map((v) => v.x))
    const ys = clusterEdges(c.hs.map((h) => h.y))
    if (xs.length < 3 || ys.length < 3) continue
    const all = [...c.hs, ...c.vs]
    const colors = new Map<string, number>()
    for (const s of all) colors.set(hex(s.color), (colors.get(hex(s.color)) ?? 0) + 1)
    const color = [...colors.entries()].sort((a, b) => b[1] - a[1])[0]![0]
    grids.push({ xs, ys, hs: c.hs, vs: c.vs, border: { width: Math.min(3, Math.max(0.25, median(all.map((s) => s.width)))), color } })
  }
  return grids
}

function coversV(vs: V[], x: number, y0: number, y1: number): boolean {
  let len = 0
  for (const v of vs) if (Math.abs(v.x - x) <= 2.5) len += Math.max(0, Math.min(v.y1, y1) - Math.max(v.y0, y0))
  return len >= (y1 - y0) * 0.7
}
function coversH(hs: H[], y: number, x0: number, x1: number): boolean {
  let len = 0
  for (const h of hs) if (Math.abs(h.y - y) <= 2.5) len += Math.max(0, Math.min(h.x1, x1) - Math.max(h.x0, x0))
  return len >= (x1 - x0) * 0.7
}

function tableFromGrid(g: Grid, runs: SRun[], ctx: Ctx): { elem: Elem; used: Set<SRun>; bbox: { x0: number; y0: number; x1: number; y1: number } } | null {
  const { xs, ys } = g
  const rows = ys.length - 1
  const cols = xs.length - 1
  const bbox = { x0: xs[0]!, y0: ys[0]!, x1: xs.at(-1)!, y1: ys.at(-1)! }
  const inside = runs.filter((r) => r.angle === 0 && r.x + r.w / 2 >= bbox.x0 - 1 && r.x + r.w / 2 <= bbox.x1 + 1 && r.y - r.size * 0.3 >= bbox.y0 - 1 && r.y - r.size * 0.3 <= bbox.y1 + 1)
  if (!inside.length) return null
  const sepRight = (r: number, c: number) => coversV(g.vs, xs[c + 1]!, ys[r]!, ys[r + 1]!)
  const sepBelow = (r: number, c: number) => coversH(g.hs, ys[r + 1]!, xs[c]!, xs[c + 1]!)
  const visited = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false))
  interface Cell { r: number; c: number; cs: number; rs: number }
  const cells: Cell[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (visited[r]![c]) continue
      let cs = 1
      while (c + cs < cols && !sepRight(r, c + cs - 1) && !visited[r]![c + cs]) cs++
      let rs = 1
      const free = (rr: number) => { for (let k = c; k < c + cs; k++) if (visited[rr]![k] || sepBelow(rr - 1, k)) return false; return true }
      while (r + rs < rows && free(r + rs)) rs++
      for (let i = r; i < r + rs; i++) for (let k = c; k < c + cs; k++) visited[i]![k] = true
      cells.push({ r, c, cs, rs })
    }
  }
  const used = new Set<SRun>()
  const tableRows: RichTable['rows'] = ys.slice(0, -1).map((y, r) => ({ height: ys[r + 1]! - y, cells: [] }))
  const fills = ctx.fills.filter((f) => !isWhiteish(f.color))
  const byCell = new Map<Cell, RichCell>()
  for (const cell of cells) {
    const x0 = xs[cell.c]!
    const x1 = xs[cell.c + cell.cs]!
    const y0 = ys[cell.r]!
    const y1 = ys[cell.r + cell.rs]!
    const mine = inside.filter((r) => {
      const cx = r.x + r.w / 2
      const cy = r.y - r.size * 0.3
      return cx >= x0 && cx < x1 && cy >= y0 && cy < y1
    })
    mine.forEach((r) => used.add(r))
    const lines = toLines(mine).map((l) => toPLine(l.runs as SRun[]))
    const content = paragraphsFor(lines, { x0, x1 }, ctx)
    placeSpacing(content, y0)
    const shade = fills.find((f) => f.x <= x0 + 2 && f.y <= y0 + 2 && f.x + f.w >= x1 - 2 && f.y + f.h >= y1 - 2)
    const rc: RichCell = { colSpan: cell.cs, rowSpan: cell.rs, width: x1 - x0, shade: shade ? hex(shade.color) : undefined, content: content.map((e) => e.el as RichParagraph), vMerge: cell.rs > 1 ? 'restart' : undefined }
    byCell.set(cell, rc)
    tableRows[cell.r]!.cells.push(rc)
    for (let i = 1; i < cell.rs; i++) tableRows[cell.r + i]!.cells.push({ colSpan: cell.cs, rowSpan: 1, width: x1 - x0, vMerge: 'continue', content: [] })
  }
  // Sắp ô trong mỗi hàng theo cột bắt đầu (ô gộp dọc xen vào đúng chỗ).
  const startCol = new Map<RichCell, number>()
  for (const [cell, rc] of byCell) startCol.set(rc, cell.c)
  for (let r = 0; r < rows; r++) {
    // Ô "continue" kế thừa cột của ô restart cùng cột: tìm theo thứ tự quét lưới.
    const placed: { col: number; rc: RichCell }[] = []
    for (const cell of cells) {
      if (cell.r === r) placed.push({ col: cell.c, rc: byCell.get(cell)! })
      else if (cell.r < r && r < cell.r + cell.rs) placed.push({ col: cell.c, rc: tableRows[r]!.cells.find((x) => x.vMerge === 'continue' && x.width === byCell.get(cell)!.width && !placed.some((p) => p.rc === x)) ?? tableRows[r]!.cells[0]! })
    }
    tableRows[r]!.cells = placed.sort((a, b) => a.col - b.col).map((p) => p.rc)
  }
  const table: RichTable = {
    type: 'table',
    colWidths: xs.slice(1).map((x, i) => x - xs[i]!),
    rows: tableRows,
    border: g.border,
    indent: 0,
  }
  return { elem: { el: table, top: bbox.y0, bottom: bbox.y1 }, used, bbox }
}

// ---------- Bảng không đường kẻ (cột chữ thẳng hàng) ----------
interface Cluster { x: number; end: number; runs: SRun[] }
function clustersOf(line: PLine): Cluster[] {
  const out: Cluster[] = []
  for (const r of line.runs) {
    const last = out.at(-1)
    if (last && r.x - last.end <= Math.max(0.6 * r.size, 5)) {
      last.runs.push(r)
      last.end = r.x + r.w
    } else out.push({ x: r.x, end: r.x + r.w, runs: [r] })
  }
  return out
}

/** Cột có phần chồng ngang lớn nhất với cụm; -1 nếu không chồng lên cột nào. */
function bestCol(cols: { x: number; end: number }[], c: { x: number; end: number }): number {
  let best = -1
  let bestOv = 0
  cols.forEach((k, i) => {
    const ov = Math.min(k.end, c.end) - Math.max(k.x, c.x)
    if (ov > bestOv) { bestOv = ov; best = i }
  })
  return best
}

function borderlessTables(lines: PLine[], box: Box, ctx: Ctx): { tables: Elem[]; rest: PLine[] } {
  const sorted = [...lines].sort((a, b) => a.y - b.y)
  const rest: PLine[] = []
  const tables: Elem[] = []
  let i = 0
  while (i < sorted.length) {
    const first = sorted[i]!
    const c0 = clustersOf(first)
    const isMarkerLine = !!detectMarker(first, ctx.ocr)
    if (c0.length < 2 || isMarkerLine) { rest.push(first); i++; continue }
    const cols = c0.map((c) => ({ x: c.x, end: c.end }))
    const run: { line: PLine; cl: Cluster[] }[] = [{ line: first, cl: c0 }]
    let j = i + 1
    while (j < sorted.length) {
      const l = sorted[j]!
      const prev = run.at(-1)!.line
      if (l.y - prev.y > Math.max(prev.size, l.size) * 2.6 || detectMarker(l, ctx.ocr)) break
      const cl = clustersOf(l)
      if (cl.length < 2) break
      const matched = cl.filter((c) => bestCol(cols, c) >= 0)
      if (matched.length < Math.max(2, Math.ceil(cl.length * 0.6))) break
      for (const c of cl) {
        const k = cols[bestCol(cols, c)]
        if (k) { k.x = Math.min(k.x, c.x); k.end = Math.max(k.end, c.end) } else cols.push({ x: c.x, end: c.end })
      }
      run.push({ line: l, cl })
      j++
    }
    // Chữ căn đều: mỗi từ là một cụm nhưng hầu như không cụm nào thẳng hàng với cụm ở dòng khác (khoảng cách từ đổi theo dòng).
    // Bảng thật: gần như mọi cụm có mép trái hoặc mép phải thẳng hàng với một cụm khác. Quá nhiều cột cũng không phải bảng.
    const all = run.flatMap((r) => r.cl)
    // "Cột mạnh": một mép (trái hoặc phải) mà ít nhất 60% số hàng cùng có (sai số 3pt). Bảng thật có ≥ 2 cột mạnh và gần như mọi cụm nằm
    // trên một cột mạnh; chữ căn đều chỉ có mép trái đoạn là cột mạnh vì khoảng cách từ đổi theo từng dòng.
    const need = Math.max(3, run.length * 0.6)
    const strong = (vals: number[]) => {
      const sorted = [...vals].sort((x, y) => x - y)
      const groups: number[][] = []
      for (const v of sorted) {
        const g = groups.at(-1)
        if (g && v - g.at(-1)! <= 3) g.push(v)
        else groups.push([v])
      }
      return groups.filter((g) => g.length >= need).map((g) => g.reduce((x, y) => x + y, 0) / g.length)
    }
    const strongStarts = strong(all.map((c) => c.x))
    const strongEnds = strong(all.map((c) => c.end))
    const explained = all.filter((c) => strongStarts.some((x) => Math.abs(x - c.x) <= 4) || strongEnds.some((x) => Math.abs(x - c.end) <= 4)).length
    const maxCols = Math.max(...run.map((r) => r.cl.length))
    // Mỗi hàng chỉ có tối đa một cụm trên mỗi cột; nhiều cụm cùng cột trong một hàng là chữ liền mạch bị tách (chữ căn đều), không phải bảng.
    const keys = [...cols].sort((a, b) => a.x - b.x)
    const crowded = run.filter((r) => {
      const seen = new Set<number>()
      return r.cl.some((c) => { const k = bestCol(keys, c); if (seen.has(k)) return true; seen.add(k); return false })
    }).length
    if (crowded > run.length * 0.2) { rest.push(first); i++; continue }
    if (strongStarts.length + strongEnds.length < 2 || explained < all.length * 0.8 || maxCols > 10) { rest.push(first); i++; continue }
    const clusterChars = run.flatMap((r) => r.cl.map((c) => c.runs.reduce((n, q) => n + q.str.length, 0)))
    // Ô của bảng ngắn; dòng chữ dài đặt cạnh nhau là cột chữ chứ không phải bảng.
    if (run.length < 3 || clusterChars.reduce((a, b) => a + b, 0) / clusterChars.length > 30) { rest.push(first); i++; continue }
    // Mỗi cột là khoảng ngang chung của các ô cùng cột (các cụm chồng lên nhau theo chiều ngang).
    const colKeys = [...cols].sort((a, b) => a.x - b.x)
    const ncols = colKeys.length
    const colX = colKeys.map((k) => k.x)
    const colRight = colKeys.map((_k, ci) => (ci + 1 < ncols ? colKeys[ci + 1]!.x : Math.max(...run.flatMap((r) => r.cl.map((c) => c.end)))))
    const rowsOut: RichTable['rows'] = []
    for (const { line, cl } of run) {
      const cellsOut: RichCell[] = Array.from({ length: ncols }, (_, ci) => ({ colSpan: 1, rowSpan: 1, width: colRight[ci]! - colX[ci]!, content: [] }))
      const buckets: SRun[][] = Array.from({ length: ncols }, () => [])
      for (const c of cl) {
        const best = Math.max(0, bestCol(colKeys, c))
        buckets[best]!.push(...c.runs)
      }
      buckets.forEach((rs, ci) => {
        if (!rs.length) return
        const pl = toPLine(rs)
        const cellBox = { x0: colX[ci]!, x1: colRight[ci]! }
        const content = paragraphsFor([pl], cellBox, ctx)
        const p = content[0]?.el as RichParagraph | undefined
        if (p) {
          // Căn phải nếu cột được khớp theo mép phải.
          const k = colKeys[ci]!
          if (Math.abs(pl.end - k.end) <= 3 && Math.abs(pl.x - k.x) > 4) { p.align = 'right'; p.indentLeft = 0 }
          p.before = 0
          cellsOut[ci]!.content = [p]
        }
      })
      rowsOut.push({ height: Math.max(line.size * 1.2, 1), cells: cellsOut })
    }
    // Chiều cao hàng theo khoảng cách giữa các dòng.
    run.forEach((r, k) => { rowsOut[k]!.height = k + 1 < run.length ? run[k + 1]!.line.y - r.line.y : Math.max(r.line.size * 1.2, 1) })
    const firstLine = run[0]!.line
    const top = firstLine.y - (firstLine.size * 1.2 - DESCENT * firstLine.size) // đầu hàng đầu: cùng cách tính với đoạn
    const rowH = rowsOut.reduce((s, r) => s + r.height, 0)
    tables.push({
      el: { type: 'table', colWidths: colX.map((x, ci) => colRight[ci]! - x), rows: rowsOut, border: null, indent: colX[0]! - box.x0 },
      top,
      bottom: top + rowH,
    })
    i = j
  }
  return { tables, rest }
}

/** Trang OCR: mép trái từng dòng lệch vài điểm do nhiễu nhận dạng; gom các mép gần nhau (≤ 6pt) về cùng một vị trí. */
function snapStarts(lines: PLine[]): void {
  const xs = [...new Set(lines.map((l) => l.x))].sort((a, b) => a - b)
  const groups: number[][] = []
  for (const x of xs) {
    const g = groups.at(-1)
    if (g && x - g[0]! <= 6) g.push(x)
    else groups.push([x])
  }
  for (const l of lines) {
    const g = groups.find((q) => q.includes(l.x))!
    l.x = median(g)
  }
}

// ---------- Khoảng cách dọc ----------
/** Đặt `before` cho các phần tử đã sắp từ trên xuống (đoạn đệm cho khoảng trống trước bảng). `start` là mép trên của vùng. */
function placeSpacing(elems: Elem[], start: number): void {
  elems.sort((a, b) => a.top - b.top)
  let prevBottom = start
  const extra: { index: number; elem: Elem }[] = []
  elems.forEach((e, idx) => {
    const gap = Math.max(0, e.top - prevBottom)
    if (e.el.type === 'p') e.el.before = Math.min(gap, 1500)
    else if (gap >= 1) extra.push({ index: idx, elem: { el: spacer(Math.min(gap, 1500)), top: prevBottom, bottom: e.top } })
    prevBottom = Math.max(e.bottom, e.el.type === 'p' ? e.top : e.bottom)
  })
  for (const { index, elem } of extra.reverse()) elems.splice(index, 0, elem)
}
const spacer = (h: number): RichParagraph => ({ type: 'p', runs: [], align: 'left', indentLeft: 0, indentRight: 0, firstLine: 0, before: 0, lineHeight: h, tabs: [] })

// ---------- Cột ----------
function findColumnSplits(spans: { x0: number; x1: number; chars: number; y: number }[]): number[] {
  if (spans.length < 6) return []
  const total = spans.reduce((n, s) => n + s.chars, 0)
  const sorted = [...spans].sort((a, b) => a.x0 - b.x0)
  const gaps: number[] = []
  let reach = sorted[0]!.x1
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i]!
    if (s.x0 - reach >= 14) {
      const left = spans.filter((t) => t.x1 <= reach + 0.01)
      const right = spans.filter((t) => t.x0 >= s.x0 - 0.01)
      const lc = left.reduce((n, t) => n + t.chars, 0)
      const rc = right.reduce((n, t) => n + t.chars, 0)
      // Cột chữ thật có dòng dài (trung bình ≥ 28 ký tự mỗi dòng); cột ô của bảng thì ngắn nên không tách ở đây.
      const perLine = (g: typeof spans) => g.reduce((n, t) => n + t.chars, 0) / Math.max(1, new Set(g.map((t) => Math.round(t.y / 3))).size)
      if (left.length >= 3 && right.length >= 3 && lc >= total * 0.12 && rc >= total * 0.12 && perLine(left) >= 28 && perLine(right) >= 28) gaps.push((reach + s.x0) / 2)
    }
    reach = Math.max(reach, s.x1)
  }
  return gaps.slice(0, 2)
}

// ---------- Vùng chữ (XY-cut) ----------
interface Leaf {
  runs: SRun[]
  x0: number
  x1: number
  y0: number
  y1: number
}
const leafOf = (runs: SRun[]): Leaf => ({
  runs,
  x0: Math.min(...runs.map((r) => r.x)),
  x1: Math.max(...runs.map((r) => r.x + r.w)),
  y0: Math.min(...runs.map((r) => r.y - r.size * 0.85)),
  y1: Math.max(...runs.map((r) => r.y + r.size * 0.25)),
})

/** Khoảng trống rộng nhất (≥ min) giữa các đoạn [a, b] đã gộp; trả về điểm cắt hoặc null. */
function widestGap(items: { a: number; b: number }[], min: number): number | null {
  const sorted = [...items].sort((p, q) => p.a - q.a)
  let reach = sorted[0]!.b
  let best: { w: number; at: number } | null = null
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i]!
    if (s.a - reach >= min && (!best || s.a - reach > best.w)) best = { w: s.a - reach, at: (reach + s.a) / 2 }
    reach = Math.max(reach, s.b)
  }
  return best ? best.at : null
}

/**
 * Cắt trang thành các vùng chữ bằng khoảng trống: ưu tiên cắt dọc (cột) rồi cắt ngang (đoạn cách nhau xa). Trả về các vùng theo thứ tự
 * đọc (trái → phải trong cùng dải, trên → dưới); `vertical` cho biết có cắt dọc không (có cột/chú thích cạnh hình).
 */
function xyCut(runs: SRun[], medianSize: number): { leaves: Leaf[]; vertical: boolean } {
  let vertical = false
  const rec = (rs: SRun[]): Leaf[] => {
    if (rs.length < 6) return [leafOf(rs)]
    const lineCount = (g: SRun[]) => new Set(g.map((r) => Math.round(r.y / 3))).size
    const vx = widestGap(rs.map((r) => ({ a: r.x, b: r.x + r.w })), 12)
    if (vx !== null) {
      const left = rs.filter((r) => r.x + r.w / 2 < vx)
      const right = rs.filter((r) => r.x + r.w / 2 >= vx)
      // Vùng chữ thật: ≥ 3 dòng và trung bình ≥ 14 ký tự/dòng (cột ô của bảng hay chữ lẻ căn phải ngắn hơn nhiều nên không bị cắt).
      const dense = (g: SRun[]) => lineCount(g) >= 3 && g.reduce((n, r) => n + r.str.trim().length, 0) / lineCount(g) >= 14
      if (left.length >= 3 && right.length >= 3 && dense(left) && dense(right)) {
        vertical = true
        return [...rec(left), ...rec(right)]
      }
    }
    const hy = widestGap(rs.map((r) => ({ a: r.y - r.size * 0.85, b: r.y + r.size * 0.25 })), Math.max(medianSize * 0.8, 6))
    if (hy !== null) {
      const top = rs.filter((r) => r.y - r.size * 0.3 < hy)
      const bottom = rs.filter((r) => r.y - r.size * 0.3 >= hy)
      if (top.length && bottom.length) return [...rec(top), ...rec(bottom)]
    }
    return [leafOf(rs)]
  }
  return { leaves: runs.length ? rec(runs) : [], vertical }
}

export interface LayoutOptions {
  bodySize: number
}

export function layoutPage(input: PageInput, opts: LayoutOptions): RichPage {
  const { text, graphics } = input
  const W = text.width
  const H = text.height
  // Lưới đường kẻ trước: nét thuộc bảng không được tính là gạch chân hay đường kẻ ngang.
  const grids = findGrids(graphics.segs)
  const inGrid = (s: Seg) => grids.some((g) => {
    const mx = (s.x1 + s.x2) / 2
    const my = (s.y1 + s.y2) / 2
    return mx >= g.xs[0]! - 3 && mx <= g.xs.at(-1)! + 3 && my >= g.ys[0]! - 3 && my <= g.ys.at(-1)! + 3
  })
  const looseSegs = graphics.segs.filter((s) => !inGrid(s))
  let runs = styleRuns(text.runs, input.styles, looseSegs)
  const ctx: Ctx = { ocr: false, bodySize: opts.bodySize, pageCenter: W / 2, fills: graphics.fills.filter((f) => f.w * f.h < W * H * 0.9) }
  // Trang quét đã OCR: ảnh quét + lớp chữ vô hình. Chữ vô hình trở thành chữ thật trong DOCX nên phải bỏ ảnh quét
  // (nếu giữ, mỗi chữ hiện hai lần: một lần trong ảnh, một lần là chữ). Cỡ chữ OCR vốn khớp từng từ nên làm đều theo dòng.
  const totalChars = runs.reduce((n, r) => n + r.str.length, 0)
  const hiddenChars = runs.filter((r) => r.invisible).reduce((n, r) => n + r.str.length, 0)
  const ocrLayer = totalChars > 0 && hiddenChars >= totalChars * 0.5
  ctx.ocr = ocrLayer
  if (ocrLayer) {
    const ocrLines = toLines(runs, 0.6)
    // Cỡ thân bài của trang: các dòng lệch không quá ~30% (nhiễu chiều cao khung chữ) được đưa về cỡ này; dòng to hẳn là tiêu đề.
    const bodyOcr = median(ocrLines.map((l) => median(l.runs.map((r) => r.size))))
    // Dòng rất nhỏ và ngắn (≤ 8 ký tự, cỡ < 60% thân bài) là nhiễu OCR từ nét vẽ/đường kẻ trong ảnh: bỏ.
    const noise = new Set<SRun>()
    for (const line of ocrLines) {
      const own = median(line.runs.map((r) => r.size))
      if (own < bodyOcr * 0.6 && line.runs.reduce((n, r) => n + r.str.trim().length, 0) <= 8) for (const r of line.runs as SRun[]) noise.add(r)
    }
    runs = runs.filter((r) => !noise.has(r))
    for (const line of ocrLines) {
      if ((line.runs as SRun[]).every((r) => noise.has(r))) continue
      const own = median(line.runs.map((r) => r.size))
      const size = Math.round((own >= bodyOcr * 0.75 && own <= bodyOcr * 1.3 ? bodyOcr : own) * 2) / 2
      for (const r of line.runs as SRun[]) {
        r.size = size
        r.font = 'Arial'
        r.family = 'sans'
        r.bold = false
        r.italic = false
      }
    }
  }
  const hiddenIn = (im: { x: number; y: number; w: number; h: number }) =>
    runs.filter((r) => r.invisible && r.x + r.w / 2 >= im.x && r.x + r.w / 2 <= im.x + im.w && r.y - r.size * 0.3 >= im.y && r.y - r.size * 0.3 <= im.y + im.h).length
  const scanImages = ocrLayer ? input.images.filter((im) => hiddenIn(im) >= 3) : []
  const keepImages = input.images.filter((im) => !scanImages.includes(im))

  // 1) Bảng có đường kẻ.
  const tableElems: Elem[] = []
  const consumed = new Set<SRun>()
  const tableBoxes: { x0: number; y0: number; x1: number; y1: number }[] = []
  for (const g of grids) {
    const t = tableFromGrid(g, runs, ctx)
    if (!t) continue
    tableElems.push(t.elem)
    tableBoxes.push(t.bbox)
    t.used.forEach((r) => consumed.add(r))
  }
  const free = runs.filter((r) => !consumed.has(r))

  // 2) Cột: khoảng trống dọc không có chữ nào cắt ngang.
  const spans = [
    ...free.filter((r) => r.angle === 0).map((r) => ({ x0: r.x, x1: r.x + r.w, chars: r.str.length, y: r.y })),
    ...tableBoxes.map((b) => ({ x0: b.x0, x1: b.x1, chars: 50, y: b.y0 })),
  ]
  const splits = findColumnSplits(spans)
  // Không có cột cắt suốt trang nhưng có vùng cạnh nhau trong từng dải (chú thích cạnh hình, khung bên): vùng chính chảy thành một cột,
  // các vùng khác thành khung chữ đặt tuyệt đối để chữ chính không bị trộn dòng với chú thích.
  const leafByRun = new Map<SRun, Leaf>()
  let frameLeaves: Leaf[] = []
  let droppedRuns = new Set<SRun>()
  if (!splits.length) {
    const horizontal = free.filter((r) => r.angle === 0)
    const { leaves, vertical } = xyCut(horizontal, median(horizontal.map((r) => r.size)) || ctx.bodySize)
    if (vertical && leaves.length > 1) {
      const chars = (l: Leaf) => l.runs.reduce((n, r) => n + r.str.length, 0)
      const anchor = leaves.reduce((a, b) => (chars(b) > chars(a) ? b : a))
      const overlap = (l: Leaf) => Math.min(l.x1, anchor.x1) - Math.max(l.x0, anchor.x0)
      const isMain = (l: Leaf) => l === anchor || overlap(l) >= 0.5 * Math.min(l.x1 - l.x0, anchor.x1 - anchor.x0)
      // Vùng phụ rất nhỏ (< 3 từ hoặc < 12 ký tự) là nhiễu OCR/ký hiệu rời: bỏ hẳn chứ không dựng khung.
      const side = leaves.filter((l) => !isMain(l))
      droppedRuns = new Set(side.filter((l) => l.runs.length < 3 || chars(l) < 12).flatMap((l) => l.runs))
      frameLeaves = side.filter((l) => l.runs.length >= 3 && chars(l) >= 12)
      for (const l of leaves.filter(isMain)) for (const r of l.runs) leafByRun.set(r, l)
    }
  }
  const frameRuns = new Set([...frameLeaves.flatMap((l) => l.runs), ...droppedRuns])
  const bounds = [-Infinity, ...splits, Infinity]
  const columns: RichColumn[] = []
  const cols: { runs: SRun[]; tables: Elem[]; x0: number; x1: number }[] = []
  for (let k = 0; k < bounds.length - 1; k++) {
    const inCol = (cx: number) => cx >= bounds[k]! && cx < bounds[k + 1]!
    const cr = free.filter((r) => inCol(r.x + r.w / 2) && !frameRuns.has(r))
    const ct = tableElems.filter((t) => { const tb = tableBoxes[tableElems.indexOf(t)]!; return inCol((tb.x0 + tb.x1) / 2) })
    if (!cr.length && !ct.length) continue
    const xs0 = [...cr.map((r) => r.x), ...ct.map((t) => tableBoxes[tableElems.indexOf(t)]!.x0)]
    const xs1 = [...cr.map((r) => r.x + r.w), ...ct.map((t) => tableBoxes[tableElems.indexOf(t)]!.x1)]
    cols.push({ runs: cr, tables: ct, x0: Math.min(...xs0), x1: Math.max(...xs1) })
  }

  // 3) Mỗi cột: đoạn văn, bảng không đường kẻ, đường kẻ ngang, rồi khoảng cách.
  const hrules = looseSegs.filter((s) => Math.abs(s.y1 - s.y2) <= 1.2 && Math.abs(s.x2 - s.x1) >= 30)
  // Đường kẻ thuộc cột có phần chồng ngang lớn nhất; với trang một cột thì mở rộng cột ra đúng độ dài đường kẻ.
  const ruleCol = new Map<Seg, number>()
  for (const s of hrules) {
    const x0 = Math.min(s.x1, s.x2)
    const x1 = Math.max(s.x1, s.x2)
    let best = -1
    let bestOverlap = -1
    cols.forEach((c, i) => {
      const ov = Math.min(x1, c.x1) - Math.max(x0, c.x0)
      if (ov > bestOverlap) { bestOverlap = ov; best = i }
    })
    if (best >= 0) ruleCol.set(s, best)
  }
  if (cols.length === 1) for (const [s] of ruleCol) { cols[0]!.x0 = Math.min(cols[0]!.x0, s.x1, s.x2); cols[0]!.x1 = Math.max(cols[0]!.x1, s.x1, s.x2) }
  const colTops: number[] = []
  const built = cols.map((c) => {
    const box: Box = { x0: c.x0, x1: c.x1 }
    const lines = toLines(c.runs, ctx.ocr ? 0.6 : 0.4).map((l) => toPLine(l.runs as SRun[]))
    for (const l of lines) l.limit = leafByRun.get(l.runs[0]!)?.x1
    if (ctx.ocr) snapStarts(lines)
    const { tables: bt, rest } = borderlessTables(lines, box, ctx)
    const elems: Elem[] = [...paragraphsFor(rest, box, ctx), ...bt, ...c.tables]
    // Đường kẻ ngang trong phạm vi cột (không phải gạch chân hay viền bảng): đoạn đệm có viền dưới.
    for (const s of hrules) {
      if (ruleCol.get(s) !== cols.indexOf(c)) continue
      const x0 = Math.min(s.x1, s.x2)
      const x1 = Math.max(s.x1, s.x2)
      const y = (s.y1 + s.y2) / 2
      const w = Math.max(0.25, s.width)
      const p: RichParagraph = { ...spacer(1), indentLeft: Math.max(0, x0 - c.x0), indentRight: Math.max(0, c.x1 - x1), borderBottom: { width: w, color: hex(s.color) } }
      elems.push({ el: p, top: y - 1, bottom: y + w })
    }
    elems.sort((a, b) => a.top - b.top)
    const top = elems.length ? Math.max(0, elems[0]!.top) : 0
    colTops.push(top)
    return { c, elems, top }
  })
  const marginTop = colTops.length ? Math.max(1, Math.min(...colTops)) : 36
  for (const b of built) {
    placeSpacing(b.elems, marginTop)
    columns.push({ x: b.c.x0, width: b.c.x1 - b.c.x0, elements: b.elems.map((e) => e.el) })
  }
  // Khung chữ đặt ở đầu luồng của trang (neo vào đoạn đầu tiên, nên luôn ở đúng trang) và bọc chữ chính xung quanh.
  const frameParas: RichParagraph[] = []
  for (const fl of frameLeaves) {
    const lines = toLines(fl.runs, ctx.ocr ? 0.6 : 0.4).map((l) => toPLine(l.runs as SRun[]))
    if (ctx.ocr) snapStarts(lines)
    for (const l of lines) l.limit = fl.x1
    const fe = paragraphsFor(lines, { x0: fl.x0, x1: fl.x1 }, ctx)
    placeSpacing(fe, fl.y0)
    for (const e of fe) if (e.el.type === 'p') {
      e.el.frame = { x: fl.x0, y: fl.y0, w: fl.x1 - fl.x0 + 6 }
      e.el.noWrap = false
      frameParas.push(e.el)
    }
  }
  if (frameParas.length && columns[0]) columns[0].elements.unshift(...frameParas)
  // Bảng là phần tử cuối cột: Word cần một đoạn sau bảng.
  for (const col of columns) if (col.elements.at(-1)?.type === 'table') col.elements.push(spacer(1))
  // Vùng hẹp cạnh hình/khung: ngắt dòng đúng mép phải của vùng (thụt lề phải = phần còn lại của vùng nội dung).
  if (frameParas.length || frameLeaves.length || leafByRun.size) {
    const contentRight = Math.max(...cols.map((c) => c.x1), ...frameLeaves.map((l) => l.x1))
    for (const col of columns) for (const e of col.elements) {
      if (e.type === 'p' && e.wrapTo !== undefined && !e.frame && e.align !== 'center' && e.align !== 'right') e.indentRight = Math.max(0, contentRight - e.wrapTo)
    }
  }
  // Đoạn một dòng không bao giờ tự ngắt trong PDF gốc: cho tràn sang khoảng trống bên phải cột để phông thay thế rộng hơn không làm rớt chữ xuống dòng.
  columns.forEach((col, i) => {
    const next = columns[i + 1]
    const slack = Math.max(0, Math.min(W * 0.25, (next ? next.x - (col.x + col.width) : W - (col.x + col.width)) - 2))
    for (const e of col.elements) if (e.type === 'p' && e.noWrap && !frameParas.length) e.indentRight = -slack
  })

  // 4) Ảnh: đặt tuyệt đối theo tọa độ trang.
  const images: RichImage[] = keepImages
    .filter((im) => im.w >= 3 && im.h >= 3)
    .map((im) => ({
      key: im.key, data: im.img.data, ext: im.img.ext, x: im.x, y: im.y, w: im.w, h: im.h,
      behind: runs.some((r) => { const cx = r.x + r.w / 2; const cy = r.y - r.size * 0.3; return cx >= im.x && cx <= im.x + im.w && cy >= im.y && cy <= im.y + im.h }),
    }))

  const left = cols.length ? Math.min(...cols.map((c) => c.x0)) : 36
  const right = cols.length || frameLeaves.length ? Math.max(...cols.map((c) => c.x1), ...frameLeaves.map((l) => l.x1)) : W - 36
  return {
    width: W,
    height: H,
    margin: { top: marginTop, left: Math.max(1, left), right: Math.max(1, W - right), bottom: 14 },
    columns,
    images,
    scanImagesRemoved: scanImages.length,
    scan: scanImages.length
      ? {
          images: scanImages.map((im) => ({ key: im.key, data: im.img.data, ext: im.img.ext, x: im.x, y: im.y, w: im.w, h: im.h })),
          textBoxes: runs.filter((r) => r.invisible).map((r) => ({ x0: r.x, y0: r.y - r.size * 1.3, x1: r.x + r.w, y1: r.y + r.size * 0.4 })),
        }
      : undefined,
  }
}
