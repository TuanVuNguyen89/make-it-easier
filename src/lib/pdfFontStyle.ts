import { PDFArray, PDFDict, PDFName, PDFNumber, type PDFDocument } from 'pdf-lib'
import { loadPdf } from './pdf'
import { findShowOps } from './pdfContent'
import { readPageContent } from './pdfPageContent'
import { visualFrame } from './pageGeometry'
import { pointInPart, type Part } from './textSegments'

export type FontFamily = 'sans' | 'serif' | 'mono'

export interface FontStyle {
  family: FontFamily
  bold: boolean
  italic: boolean
  /** Tên phông gốc (đã bỏ tiền tố tập con "ABCDEF+"), để hiển thị cho người dùng. */
  name: string
}

const FLAG_FIXED = 1
const FLAG_SERIF = 2
const FLAG_ITALIC = 64
const FLAG_FORCE_BOLD = 262144

const MONO = /courier|mono|consolas|menlo|monaco|lucidaconsole|inconsolata|sourcecode|firacode|typewriter|cousine/
// Phải kiểm tra "sans" trước "serif" vì "sansserif" chứa chữ serif.
const SANS = /sans|arial|helvetica|calibri|verdana|tahoma|segoe|roboto|lato|arimo|gothic|trebuchet|futura|myriad|frutiger|inter|ubuntu|opensans|noto(?!serif)|swiss|univers/
const SERIF = /times|tinos|georgia|garamond|cambria|palatino|bookantiqua|bookman|minion|baskerville|bodoni|didot|century|mincho|charter|caslon|constantia|merriweather|lora|playfair|serif|roman|song/

/** Đoán họ phông (sans/serif/mono), đậm, nghiêng từ tên phông và cờ trong FontDescriptor. */
export function classifyFont(baseFont: string, flags?: number, weight?: number): FontStyle {
  const name = baseFont.replace(/^[A-Z]{6}\+/, '')
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const f = flags ?? 0
  const family: FontFamily = MONO.test(n) ? 'mono' : SANS.test(n) ? 'sans' : SERIF.test(n) ? 'serif' : f & FLAG_FIXED ? 'mono' : f & FLAG_SERIF ? 'serif' : 'sans'
  return {
    family,
    bold: /bold|black|heavy|semibold|demi/.test(n) || !!(f & FLAG_FORCE_BOLD) || (weight ?? 0) >= 600,
    italic: /italic|oblique|ital|kursiv/.test(n) || !!(f & FLAG_ITALIC),
    name,
  }
}

/** Tra FontDescriptor của phông có tên tài nguyên `res` trên trang (kể cả phông Type0 ghép). */
export function fontStyleOf(doc: PDFDocument, pageIndex: number, res: string): FontStyle | null {
  void doc
  const page = doc.getPage(pageIndex)
  const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict)
  const font = fonts?.lookupMaybe(PDFName.of(res), PDFDict)
  if (!font) return null
  const base = font.lookupMaybe(PDFName.of('BaseFont'), PDFName)?.decodeText() ?? res
  let desc = font.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
  if (!desc) {
    const descendants = font.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)
    desc = descendants?.lookupMaybe(0, PDFDict)?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
  }
  const flags = desc?.lookupMaybe(PDFName.of('Flags'), PDFNumber)?.asNumber()
  const weight = desc?.lookupMaybe(PDFName.of('FontWeight'), PDFNumber)?.asNumber()
  return classifyFont(base, flags, weight)
}

/** Điểm bắt đầu (tọa độ nhìn thấy) của một lệnh vẽ chữ cùng phông và màu của nó. */
export interface OpStyle {
  x: number
  y: number
  font: FontStyle | null
  fill: [number, number, number] | null
  /** Chữ vô hình (Tr 3), ví dụ lớp chữ OCR. */
  invisible: boolean
}

/** Phông và màu của mọi lệnh vẽ chữ trên từng trang (chỉ nội dung trang, không đi vào Form XObject). */
export function pageOpStyles(doc: PDFDocument, pageIndex: number): OpStyle[] {
  const bytes = readPageContent(doc, pageIndex)
  if (!bytes) return []
  const f = visualFrame(doc.getPage(pageIndex))
  const cache = new Map<string, FontStyle | null>()
  return findShowOps(bytes).map((op) => {
    const v = f.toVisual(op.x, op.y)
    let font: FontStyle | null = null
    if (op.font) {
      if (!cache.has(op.font)) cache.set(op.font, fontStyleOf(doc, pageIndex, op.font))
      font = cache.get(op.font) ?? null
    }
    return { x: v.x, y: v.y, font, fill: op.fill, invisible: op.invisible }
  })
}

export async function extractTextStyles(bytes: Uint8Array): Promise<OpStyle[][]> {
  const doc = await loadPdf(bytes)
  return doc.getPageIndices().map((i) => pageOpStyles(doc, i))
}

/** Phông và màu của khối: lấy từ lệnh vẽ chữ đầu tiên nằm trong một phần của khối. */
export function styleForParts(ops: OpStyle[], parts: Part[], angle: number): { font: FontStyle | null; fill: [number, number, number] | null } {
  for (const op of ops) {
    if (parts.some((p) => pointInPart(op, p, angle))) return { font: op.font, fill: op.fill }
  }
  return { font: null, fill: null }
}

export const toHex = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('')}`
