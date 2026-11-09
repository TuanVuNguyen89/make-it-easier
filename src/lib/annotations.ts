import { BlendMode, LineCapStyle, PDFName, degrees, rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib'
import { loadFamilyFont, loadUnicodeFont } from './fonts'
import { loadPdf, throwIfAborted } from './pdf'
import { visualFrame } from './pageGeometry'
import { findShowOps, removeShowOps } from './pdfContent'
import { readPageContent } from './pdfPageContent'
import { pointInPart, segmentCorners } from './textSegments'
import { alignOffset, wrapParagraphs, type TextAlign } from './wrapText'
import { ToolError } from '@/tools/types'

/**
 * Tọa độ của mọi thành phần là "tọa độ nhìn thấy": gốc ở góc trên-trái của trang như người dùng thấy
 * (đã tính xoay), đơn vị điểm PDF, trục y hướng xuống. Nhờ vậy trình chỉnh và bộ xuất dùng chung một hệ,
 * và trang xoay vẫn đúng.
 */
export type Annotation = { id: string; page: number } & (
  | { type: 'ink'; points: [number, number][]; color: string; width: number }
  | { type: 'highlight'; x: number; y: number; w: number; h: number; color: string }
  | { type: 'whiteout'; x: number; y: number; w: number; h: number }
  | { type: 'redact'; x: number; y: number; w: number; h: number }
  | { type: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number; color: string; width: number; fill: boolean }
  | { type: 'line' | 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { type: 'text'; x: number; y: number; text: string; size: number; color: string }
  | { type: 'image'; x: number; y: number; w: number; h: number; data: Uint8Array }
  | { type: 'checkbox'; x: number; y: number; size: number; checked: boolean; color: string }
  | {
      /** Sửa chữ có sẵn: xóa lệnh vẽ chữ gốc tại `origins` rồi vẽ `text` tại (x, baseline). */
      type: 'textEdit'
      /** Điểm bắt đầu chữ (mép trái, đường cơ sở dòng đầu) theo tọa độ nhìn thấy; hướng chữ `angle` (độ ngược chiều kim đồng hồ). */
      x: number
      baseline: number
      angle: number
      /** Bề rộng khối (dọc theo chữ) và chiều cao khung bao chữ gốc. Khối nhiều dòng thì chữ mới tự xuống dòng trong `w`. */
      w: number
      h: number
      /** Số dòng của khối gốc và khoảng cách giữa hai đường cơ sở liền nhau. */
      lines: number
      lineHeight: number
      original: string
      text: string
      size: number
      color: string
      /** Họ phông của chữ mới: sans/serif/mono = phông tương đương Arial/Times/Courier (đủ tiếng Việt), dejavu = phông Unicode rộng. */
      family: EditFamily
      bold: boolean
      italic: boolean
      /** Căn lề trong khối (rộng `w`): trái (mặc định), giữa, phải. */
      align?: TextAlign
      /** Tên phông gốc, chỉ để hiển thị. */
      sourceFont?: string
      /** Các phần (dải chữ trên một đường cơ sở) của chữ gốc; chỉ lệnh vẽ chữ nằm trong một phần mới bị xóa. */
      parts: { x: number; baseline: number; w: number }[]
    }
)

export type { TextAlign }
export type EditFamily = 'sans' | 'serif' | 'mono' | 'dejavu'
export const EDIT_FAMILIES: EditFamily[] = ['sans', 'serif', 'mono', 'dejavu']

const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
const isJpg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8

function color(hex: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) throw new ToolError('invalid-options', `Bad color: ${hex}`)
  const n = parseInt(m[1]!, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x))

function validate(a: Annotation, pageCount: number) {
  if (!Number.isInteger(a.page) || a.page < 0 || a.page >= pageCount) throw new ToolError('invalid-options', 'Annotation page out of range')
  const ok =
    a.type === 'ink' ? a.points.length > 0 && a.points.every((p) => finite(p[0], p[1])) && finite(a.width)
    : a.type === 'highlight' || a.type === 'whiteout' || a.type === 'redact' ? finite(a.x, a.y, a.w, a.h)
    : a.type === 'rect' || a.type === 'ellipse' ? finite(a.x, a.y, a.w, a.h, a.width)
    : a.type === 'line' || a.type === 'arrow' ? finite(a.x1, a.y1, a.x2, a.y2, a.width)
    : a.type === 'text' ? finite(a.x, a.y, a.size) && a.size > 0 && typeof a.text === 'string'
    : a.type === 'image' ? finite(a.x, a.y, a.w, a.h) && a.data instanceof Uint8Array
    : a.type === 'checkbox' ? finite(a.x, a.y, a.size)
    : a.type === 'textEdit'
      ? finite(a.x, a.baseline, a.angle, a.w, a.h, a.size, a.lines, a.lineHeight) && a.size > 0 && a.lines >= 1 && a.lineHeight > 0 &&
        typeof a.text === 'string' && typeof a.original === 'string' && EDIT_FAMILIES.includes(a.family) && typeof a.bold === 'boolean' && typeof a.italic === 'boolean' &&
        Array.isArray(a.parts) && a.parts.length > 0 && a.parts.every((p) => finite(p.x, p.baseline, p.w))
    : false
  if (!ok) throw new ToolError('invalid-options', 'Bad annotation')
}

export interface ApplyResult {
  bytes: Uint8Array
  /** Mã cảnh báo cho người dùng: 'edit-cover-only' (không xóa được chữ gốc, chỉ phủ lên), 'font-fallback'. */
  warnings: string[]
}

export async function applyAnnotations(bytes: Uint8Array, annotations: Annotation[], signal: AbortSignal, progress: (f: number) => void): Promise<Uint8Array> {
  return (await applyAnnotationsDetailed(bytes, annotations, signal, progress)).bytes
}

type TextEdit = Extract<Annotation, { type: 'textEdit' }>

const MATCH_TOL = 1.5 // điểm: sai số khi khớp vị trí chữ gốc

/**
 * Xóa lệnh vẽ chữ gốc của các đoạn được sửa trong luồng nội dung của trang. Trả về id các thành phần đã xóa HẾT chữ gốc;
 * phần còn lại chỉ có thể được phủ lên.
 *
 * Khớp theo khung: lệnh có điểm bắt đầu nằm trên đường cơ sở của đoạn và trong khoảng dọc theo chữ của nó đều thuộc đoạn
 * (pdf.js gộp các lệnh sát nhau thành một đoạn nên không thể chỉ khớp điểm bắt đầu đầu tiên). Nếu sau một lệnh như vậy còn
 * lệnh nối tiếp không đặt lại vị trí thì xóa lệnh đầu sẽ làm lệnh sau dịch chỗ, nên không xóa gì mà để phủ lên.
 */
function rewritePageText(doc: PDFDocument, pageIndex: number, edits: TextEdit[]): Set<string> {
  const page = doc.getPage(pageIndex)
  const f = visualFrame(page)
  const all = readPageContent(doc, pageIndex)
  if (!all) return new Set() // dạng lạ: không dám sửa

  const ops = findShowOps(all)
  const at = ops.map((o) => f.toVisual(o.x, o.y))
  const inPart = (e: TextEdit, part: TextEdit['parts'][number], i: number) => ops[i]!.reliable && pointInPart(at[i]!, part, e.angle, MATCH_TOL)

  const clean = new Set<string>()
  const doomed = new Set<number>()
  for (const e of edits) {
    // Mỗi phần phải tìm thấy ít nhất một lệnh; thiếu phần nào thì không xóa gì (tránh để lại nửa chữ cũ nửa chữ mới).
    const perPart = e.parts.map((part) => ops.map((_, i) => i).filter((i) => inPart(e, part, i)))
    const hit = perPart.flat()
    const shifts = hit.some((i) => ops[i + 1] && !ops[i + 1]!.reliable)
    if (perPart.some((h) => h.length === 0) || shifts) continue
    hit.forEach((i) => doomed.add(i))
    clean.add(e.id)
  }
  const { bytes, removed } = removeShowOps(all, ops, (op) => doomed.has(ops.indexOf(op)))
  if (removed.length) {
    const ref = doc.context.register(doc.context.flateStream(bytes))
    page.node.set(PDFName.of('Contents'), ref)
  }
  return clean
}

export async function applyAnnotationsDetailed(bytes: Uint8Array, annotations: Annotation[], signal: AbortSignal, progress: (f: number) => void): Promise<ApplyResult> {
  if (!Array.isArray(annotations) || annotations.length === 0) throw new ToolError('invalid-options', 'Nothing to apply')
  const doc = await loadPdf(bytes)
  const pageCount = doc.getPageCount()
  annotations.forEach((a) => validate(a, pageCount))
  const warnings = new Set<string>()

  // Chữ được sửa thật sự (đổi nội dung); đoạn không đổi thì bỏ qua hoàn toàn.
  const edits = annotations.filter((a): a is TextEdit => a.type === 'textEdit' && a.text !== a.original)
  const cleanly = new Set<string>()
  for (const page of new Set(edits.map((e) => e.page))) {
    for (const id of rewritePageText(doc, page, edits.filter((e) => e.page === page))) cleanly.add(id)
  }
  for (const e of edits) if (!cleanly.has(e.id)) warnings.add('edit-cover-only')

  const needFonts = annotations.some((a) => a.type === 'text' || (a.type === 'textEdit' && a.text !== a.original))
  if (needFonts) doc.registerFontkit((await import('@pdf-lib/fontkit')).default)
  const fonts = new Map<string, PDFFont>()
  const unicode = async () => getFont(doc, fonts, 'dejavu', false, false)

  for (let i = 0; i < annotations.length; i++) {
    throwIfAborted(signal)
    const a = annotations[i]!
    if (a.type === 'textEdit') await drawTextEdit(doc, a, fonts, cleanly.has(a.id), warnings)
    else await draw(doc, a, a.type === 'text' ? await unicode() : null)
    progress((i + 1) / annotations.length)
  }
  return { bytes: await doc.save(), warnings: [...warnings] }
}

/** Nhúng (và nhớ) một biến thể phông; dejavu dùng bộ DejaVu, còn lại dùng phông tương đương Arimo/Tinos/Cousine. */
async function getFont(doc: PDFDocument, cache: Map<string, PDFFont>, family: EditFamily, bold: boolean, italic: boolean): Promise<PDFFont> {
  const key = `${family}|${bold}|${italic}`
  let f = cache.get(key)
  if (!f) {
    const bytes = family === 'dejavu' ? await loadUnicodeFont(bold ? 'bold' : italic ? 'italic' : 'regular') : await loadFamilyFont(family, bold, italic)
    f = await doc.embedFont(bytes, { subset: true })
    cache.set(key, f)
  }
  return f
}

async function drawTextEdit(doc: PDFDocument, a: TextEdit, fonts: Map<string, PDFFont>, cleanly: boolean, warnings: Set<string>) {
  if (a.text === a.original) return
  const page = doc.getPage(a.page)
  // Không xóa được chữ gốc thì phủ ô trắng lên từng dòng để chữ mới đọc được (chữ gốc vẫn còn trong tệp).
  if (!cleanly) for (const part of a.parts) path(page, segmentCorners({ x: part.x, baseline: part.baseline, angle: a.angle, w: part.w, size: a.size }, 1), { close: true, fill: '#ffffff' })
  if (!a.text.trim()) return
  let font = await getFont(doc, fonts, a.family, a.bold, a.italic)
  // Phông được chọn thiếu ký tự (ví dụ chữ ngoài bộ Latin): dùng DejaVu cho đoạn này và báo.
  const have = new Set(font.getCharacterSet())
  if ([...a.text].some((c) => c !== '\n' && !have.has(c.codePointAt(0)!))) {
    font = await getFont(doc, fonts, 'dejavu', a.bold, a.italic)
    warnings.add('font-fallback')
  }
  const fr = visualFrame(page)
  const th = (-a.angle * Math.PI) / 180
  // Khối nhiều dòng: chữ mới tự xuống dòng trong bề rộng của khối; một dòng: chỉ xuống dòng khi người dùng gõ.
  const lines = wrapParagraphs(a.text, (str) => font.widthOfTextAtSize(str, a.size), a.lines > 1 ? a.w : 0)
  lines.forEach((line, i) => {
    if (!line) return
    // Dòng thứ i nằm dưới dòng đầu theo hướng vuông góc với chữ (giữ đúng hướng chữ gốc, kể cả trang xoay).
    const off = alignOffset(a.align, a.w, font.widthOfTextAtSize(line, a.size)) // dọc theo hướng chữ
    const ox = a.x + Math.cos(th) * off - Math.sin(th) * i * a.lineHeight
    const oy = a.baseline + Math.sin(th) * off + Math.cos(th) * i * a.lineHeight
    const p = fr.toPage(ox, fr.vh - oy)
    page.drawText(line, { x: p.x, y: p.y, size: a.size, font, color: color(a.color), rotate: degrees(fr.rotation + a.angle) })
  })
}

/** Vẽ một đường/đa giác theo điểm trong tọa độ nhìn thấy, ánh xạ sang tọa độ trang rồi dùng SVG path. */
function path(
  page: PDFPage,
  pts: [number, number][],
  o: { close?: boolean; fill?: string; stroke?: string; width?: number; opacity?: number; blend?: BlendMode },
) {
  const f = visualFrame(page)
  const d = pts
    .map(([vx, vyTop], i) => {
      const p = f.toPage(vx, f.vh - vyTop)
      return `${i === 0 ? 'M' : 'L'} ${p.x} ${-p.y}` // pdf-lib lật trục y của SVG: (X, -Y) vẽ tại (X, Y)
    })
    .join(' ')
  page.drawSvgPath(o.close ? `${d} Z` : d, {
    x: 0,
    y: 0,
    color: o.fill ? color(o.fill) : undefined,
    opacity: o.opacity,
    borderColor: o.stroke ? color(o.stroke) : undefined,
    borderWidth: o.stroke ? (o.width ?? 1) : 0,
    borderLineCap: LineCapStyle.Round,
    blendMode: o.blend,
  })
}

const rectPts = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]

function ellipsePts(x: number, y: number, w: number, h: number): [number, number][] {
  const n = 64
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2
    return [x + w / 2 + (w / 2) * Math.cos(t), y + h / 2 + (h / 2) * Math.sin(t)] as [number, number]
  })
}

async function draw(doc: PDFDocument, a: Exclude<Annotation, { type: 'textEdit' }>, font: PDFFont | null) {
  const page = doc.getPage(a.page)
  switch (a.type) {
    case 'ink':
      // Một điểm đơn lẻ (chấm) vẽ thành đoạn rất ngắn để vẫn hiện nét tròn.
      path(page, a.points.length === 1 ? [a.points[0]!, [a.points[0]![0] + 0.01, a.points[0]![1]]] : a.points, { stroke: a.color, width: a.width })
      break
    case 'highlight':
      path(page, rectPts(a.x, a.y, a.w, a.h), { close: true, fill: a.color, opacity: 0.4, blend: BlendMode.Multiply })
      break
    case 'whiteout':
      path(page, rectPts(a.x, a.y, a.w, a.h), { close: true, fill: '#ffffff' })
      break
    case 'redact': // chỉ che bằng hình đen; việc xóa chữ thật sự do công cụ Biên tập (rasterize) đảm nhiệm
      path(page, rectPts(a.x, a.y, a.w, a.h), { close: true, fill: '#000000' })
      break
    case 'rect':
      path(page, rectPts(a.x, a.y, a.w, a.h), { close: true, stroke: a.color, width: a.width, fill: a.fill ? a.color : undefined })
      break
    case 'ellipse':
      path(page, ellipsePts(a.x, a.y, a.w, a.h), { close: true, stroke: a.color, width: a.width, fill: a.fill ? a.color : undefined })
      break
    case 'line':
      path(page, [[a.x1, a.y1], [a.x2, a.y2]], { stroke: a.color, width: a.width })
      break
    case 'arrow': {
      path(page, [[a.x1, a.y1], [a.x2, a.y2]], { stroke: a.color, width: a.width })
      const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1)
      const head = Math.max(8, a.width * 4)
      const wing = (s: number): [number, number] => [a.x2 - head * Math.cos(ang + s * 0.45), a.y2 - head * Math.sin(ang + s * 0.45)]
      path(page, [wing(1), [a.x2, a.y2], wing(-1)], { stroke: a.color, width: a.width })
      break
    }
    case 'text': {
      const f = visualFrame(page)
      a.text.split('\n').forEach((line, i) => {
        if (!line) return
        const p = f.toPage(a.x, f.vh - (a.y + a.size * 0.9 + i * a.size * 1.2)) // gốc dòng chữ
        page.drawText(line, { x: p.x, y: p.y, size: a.size, font: font!, color: color(a.color), rotate: degrees(f.rotation) })
      })
      break
    }
    case 'image': {
      const img = isPng(a.data) ? await doc.embedPng(a.data) : isJpg(a.data) ? await doc.embedJpg(a.data) : null
      if (!img) throw new ToolError('invalid-image', 'Unsupported image in annotation')
      const f = visualFrame(page)
      const p = f.toPage(a.x, f.vh - (a.y + a.h)) // góc dưới-trái nhìn thấy
      page.drawImage(img, { x: p.x, y: p.y, width: a.w, height: a.h, rotate: degrees(f.rotation) })
      break
    }
    case 'checkbox': {
      const { x, y, size: s } = a
      path(page, rectPts(x, y, s, s), { close: true, stroke: a.color, width: Math.max(1, s / 12) })
      if (a.checked) path(page, [[x + s * 0.2, y + s * 0.55], [x + s * 0.42, y + s * 0.78], [x + s * 0.82, y + s * 0.25]], { stroke: a.color, width: Math.max(1.5, s / 9) })
      break
    }
  }
}
