import { IDENT, cmyk, mul, tokenize, type Mat, type Tok } from './pdfContent'

/**
 * Đường kẻ, ô tô màu và ảnh trên một trang, lấy từ luồng nội dung (không đi vào Form XObject). Tọa độ trả về là tọa độ
 * nhìn thấy (gốc trên-trái, y hướng xuống, điểm) nên dùng thẳng được với chữ từ `extractPdfText`.
 */
export type RGB = [number, number, number]

export interface Seg {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Độ dày nét (điểm). */
  width: number
  color: RGB | null
}
export interface FillRect {
  x: number
  y: number
  w: number
  h: number
  color: RGB | null
}
export interface PlacedImage {
  name: string
  x: number
  y: number
  w: number
  h: number
}
export interface PageGraphics {
  segs: Seg[]
  fills: FillRect[]
  images: PlacedImage[]
}

type Pt = [number, number]

/** Duyệt luồng nội dung, theo dõi CTM, màu và đường dẫn; `toVisual` đổi điểm trong không gian trang sang tọa độ nhìn thấy. */
export function findGraphics(bytes: Uint8Array, toVisual: (x: number, y: number) => { x: number; y: number }, isImage: (name: string) => boolean): PageGraphics {
  const toks = tokenize(bytes)
  const out: PageGraphics = { segs: [], fills: [], images: [] }
  let ctm: Mat = IDENT
  let fill: RGB | null = [0, 0, 0]
  let stroke: RGB | null = [0, 0, 0]
  let lw = 1
  const stack: { ctm: Mat; fill: RGB | null; stroke: RGB | null; lw: number }[] = []
  let operands: Tok[] = []
  // Đường dẫn hiện tại: các đường gấp khúc (đã ở tọa độ nhìn thấy) và các hình chữ nhật.
  let subpaths: Pt[][] = []
  let rects: { pts: Pt[] }[] = []
  let cur: Pt[] | null = null

  const apply = (m: Mat, x: number, y: number): Pt => {
    const px = x * m[0] + y * m[2] + m[4]
    const py = x * m[1] + y * m[3] + m[5]
    const v = toVisual(px, py)
    return [v.x, v.y]
  }
  const scale = () => Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1
  const reset = () => {
    subpaths = []
    rects = []
    cur = null
  }
  const color = (n: number[], kind: 'fill' | 'stroke', hasName: boolean): RGB | null => {
    void kind
    if (hasName) return null
    if (n.length === 1) return [n[0]!, n[0]!, n[0]!]
    if (n.length === 3) return [n[0]!, n[1]!, n[2]!]
    if (n.length === 4) return cmyk(n)
    return null
  }

  /** Đường gấp khúc kín gồm 4 đỉnh thẳng trục (pdf-lib vẽ hình chữ nhật bằng m/l/h thay vì re). */
  const asRect = (pts: Pt[]): { pts: Pt[] } | null => {
    const uniq = pts.filter((p, i) => !pts.slice(0, i).some((q) => Math.abs(q[0] - p[0]) < 0.3 && Math.abs(q[1] - p[1]) < 0.3))
    if (uniq.length !== 4) return null
    const xs = [...new Set(uniq.map((p) => Math.round(p[0] * 2) / 2))]
    const ys = [...new Set(uniq.map((p) => Math.round(p[1] * 2) / 2))]
    return xs.length === 2 && ys.length === 2 ? { pts: uniq } : null
  }

  const paint = (doFill: boolean, doStroke: boolean) => {
    const w = lw * scale()
    if (doFill) {
      const polyRects = subpaths.map(asRect).filter((r): r is { pts: Pt[] } => r !== null)
      for (const r of [...rects, ...polyRects]) {
        const xs = r.pts.map((p) => p[0])
        const ys = r.pts.map((p) => p[1])
        const x = Math.min(...xs)
        const y = Math.min(...ys)
        const rw = Math.max(...xs) - x
        const rh = Math.max(...ys) - y
        // Hình chữ nhật rất mỏng được dùng làm đường kẻ: coi là đoạn thẳng có độ dày.
        if (rh <= 2.5 && rw >= 4) out.segs.push({ x1: x, y1: y + rh / 2, x2: x + rw, y2: y + rh / 2, width: Math.max(rh, 0.25), color: fill })
        else if (rw <= 2.5 && rh >= 4) out.segs.push({ x1: x + rw / 2, y1: y, x2: x + rw / 2, y2: y + rh, width: Math.max(rw, 0.25), color: fill })
        else if (rw > 2.5 && rh > 2.5) out.fills.push({ x, y, w: rw, h: rh, color: fill })
      }
    }
    if (doStroke) {
      const lines: Pt[][] = [...subpaths, ...rects.map((r) => [...r.pts, r.pts[0]!])]
      for (const pts of lines) {
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1]!
          const b = pts[i]!
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.5) out.segs.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], width: w, color: stroke })
        }
      }
    }
  }

  for (const t of toks) {
    if (t.kind !== 'op') {
      operands.push(t)
      continue
    }
    const n = operands.filter((o) => o.kind === 'num').map((o) => o.num!)
    const named = operands.some((o) => o.kind === 'name')
    switch (t.text) {
      case 'q': stack.push({ ctm, fill, stroke, lw }); break
      case 'Q': { const st = stack.pop(); if (st) ({ ctm, fill, stroke, lw } = st); break }
      case 'cm': if (n.length >= 6) ctm = mul(n.slice(-6) as Mat, ctm); break
      case 'w': if (n.length) lw = n.at(-1)!; break
      case 'g': if (n.length) fill = [n.at(-1)!, n.at(-1)!, n.at(-1)!]; break
      case 'G': if (n.length) stroke = [n.at(-1)!, n.at(-1)!, n.at(-1)!]; break
      case 'rg': if (n.length >= 3) fill = n.slice(-3) as RGB; break
      case 'RG': if (n.length >= 3) stroke = n.slice(-3) as RGB; break
      case 'k': if (n.length >= 4) fill = cmyk(n.slice(-4)); break
      case 'K': if (n.length >= 4) stroke = cmyk(n.slice(-4)); break
      case 'sc': case 'scn': fill = color(n, 'fill', named); break
      case 'SC': case 'SCN': stroke = color(n, 'stroke', named); break
      case 'm': if (n.length >= 2) { cur = [apply(ctm, n.at(-2)!, n.at(-1)!)]; subpaths.push(cur) } break
      case 'l': if (n.length >= 2) { if (!cur) { cur = []; subpaths.push(cur) } cur.push(apply(ctm, n.at(-2)!, n.at(-1)!)) } break
      case 'h': if (cur && cur.length) cur.push(cur[0]!); break
      case 're': if (n.length >= 4) {
        const [x, y, w, h] = n.slice(-4) as [number, number, number, number]
        rects.push({ pts: [apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x + w, y + h), apply(ctm, x, y + h)] })
        cur = null
      } break
      case 'S': case 's': paint(false, true); reset(); break
      case 'f': case 'F': case 'f*': paint(true, false); reset(); break
      case 'B': case 'B*': case 'b': case 'b*': paint(true, true); reset(); break
      case 'n': reset(); break
      case 'Do': {
        const name = operands.find((o) => o.kind === 'name')?.text
        if (name && isImage(name)) {
          const c = [apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)]
          const xs = c.map((p) => p[0])
          const ys = c.map((p) => p[1])
          out.images.push({ name, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) })
        }
        break
      }
    }
    operands = []
  }
  return out
}
