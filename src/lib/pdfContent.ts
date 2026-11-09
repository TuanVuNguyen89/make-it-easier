/**
 * Phân tích luồng nội dung trang PDF để biết mỗi lệnh vẽ chữ (Tj, TJ, ', ") nằm ở đâu và xóa được đúng lệnh đó.
 * Khớp theo VỊ TRÍ (điểm bắt đầu của chữ), không theo nội dung, nên không phụ thuộc phông hay cách mã hóa chữ.
 */
export type Mat = [number, number, number, number, number, number]

export interface ShowOp {
  op: 'Tj' | 'TJ' | "'" | '"'
  /** Khoảng byte của cả lệnh (từ toán hạng đầu đến hết toán tử). */
  start: number
  end: number
  /** Điểm bắt đầu của chữ trong không gian người dùng của trang (đã nhân CTM). */
  x: number
  y: number
  /**
   * false khi vị trí không tin cậy: lệnh này nối tiếp lệnh vẽ chữ trước mà không đặt lại vị trí, nên điểm bắt đầu phụ thuộc
   * bề rộng chữ trước đó (cần số đo phông). Những lệnh này không bao giờ bị khớp.
   */
  reliable: boolean
  /** Tên tài nguyên phông (Tf) đang dùng khi vẽ chữ này, ví dụ "F1"; null nếu chưa đặt. */
  font: string | null
  /** Màu tô chữ (RGB 0–1) nếu là màu thiết bị (g, rg, k, hoặc sc/scn số thuần); null nếu không xác định (mẫu tô, không gian màu lạ). */
  fill: [number, number, number] | null
}

const WS = new Set([0, 9, 10, 12, 13, 32])
const DELIM = new Set('()<>[]{}/%'.split('').map((c) => c.charCodeAt(0)))
const isWs = (b: number) => WS.has(b)
const isDelim = (b: number) => DELIM.has(b)

const mul = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
]
const IDENT: Mat = [1, 0, 0, 1, 0, 0]
const cmyk = ([c, m, y, k]: number[]): [number, number, number] => [(1 - c!) * (1 - k!), (1 - m!) * (1 - k!), (1 - y!) * (1 - k!)]

interface Tok {
  kind: 'op' | 'num' | 'name' | 'other'
  start: number
  end: number
  text?: string
  num?: number
}

/** Quét một khối lồng nhau (mảng [] hoặc từ điển <<>>) và trả về vị trí ngay sau nó. */
function skipNested(b: Uint8Array, i: number): number {
  let depth = 0
  while (i < b.length) {
    const c = b[i]!
    if (c === 0x28) i = skipLiteral(b, i) // (
    else if (c === 0x3c && b[i + 1] === 0x3c) { depth++; i += 2 } // <<
    else if (c === 0x3e && b[i + 1] === 0x3e) { depth--; i += 2; if (depth <= 0) return i } // >>
    else if (c === 0x3c) { while (i < b.length && b[i] !== 0x3e) i++; i++ } // <hex>
    else if (c === 0x5b) { depth++; i++ } // [
    else if (c === 0x5d) { depth--; i++; if (depth <= 0) return i } // ]
    else i++
  }
  return i
}

/** Chuỗi ( ... ) có thoát và ngoặc lồng nhau; trả về vị trí ngay sau dấu ). */
function skipLiteral(b: Uint8Array, i: number): number {
  let depth = 0
  for (; i < b.length; i++) {
    const c = b[i]!
    if (c === 0x5c) i++ // \ thoát ký tự kế
    else if (c === 0x28) depth++
    else if (c === 0x29 && --depth === 0) return i + 1
  }
  return i
}

function tokenize(b: Uint8Array): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < b.length) {
    const c = b[i]!
    if (isWs(c)) { i++; continue }
    if (c === 0x25) { while (i < b.length && b[i] !== 10 && b[i] !== 13) i++; continue } // chú thích %
    const start = i
    if (c === 0x28) { i = skipLiteral(b, i); toks.push({ kind: 'other', start, end: i }); continue }
    if (c === 0x3c && b[i + 1] === 0x3c) { i = skipNested(b, i); toks.push({ kind: 'other', start, end: i }); continue }
    if (c === 0x3c) { while (i < b.length && b[i] !== 0x3e) i++; i++; toks.push({ kind: 'other', start, end: i }); continue }
    if (c === 0x5b) { i = skipNested(b, i); toks.push({ kind: 'other', start, end: i }); continue }
    if (c === 0x2f) { // /Name (có thể có mã #xx)
      i++
      while (i < b.length && !isWs(b[i]!) && !isDelim(b[i]!)) i++
      const raw = String.fromCharCode(...b.subarray(start + 1, i))
      toks.push({ kind: 'name', start, end: i, text: raw.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))) })
      continue
    }
    if (isDelim(c)) { i++; continue } // dấu lạc: bỏ qua
    while (i < b.length && !isWs(b[i]!) && !isDelim(b[i]!)) i++
    const text = String.fromCharCode(...b.subarray(start, i))
    const n = Number(text)
    toks.push(Number.isFinite(n) && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(text) ? { kind: 'num', start, end: i, text, num: n } : { kind: 'op', start, end: i, text })
    // Ảnh nội tuyến: bỏ qua dữ liệu nhị phân đến EI để không bị hiểu nhầm là lệnh.
    if (text === 'ID') {
      let j = i + 1
      while (j < b.length && !(isWs(b[j - 1]!) && b[j] === 0x45 && b[j + 1] === 0x49 && (j + 2 >= b.length || isWs(b[j + 2]!)))) j++
      i = j
    }
  }
  return toks
}

/** Duyệt luồng nội dung, theo dõi CTM và ma trận chữ, trả về mọi lệnh vẽ chữ kèm điểm bắt đầu. */
export function findShowOps(bytes: Uint8Array): ShowOp[] {
  const toks = tokenize(bytes)
  const out: ShowOp[] = []
  let ctm: Mat = IDENT
  let font: string | null = null
  let fill: [number, number, number] | null = [0, 0, 0]
  // q/Q lưu và khôi phục cả CTM, phông và màu tô (đều là một phần trạng thái đồ họa).
  const stack: { ctm: Mat; font: string | null; fill: [number, number, number] | null }[] = []
  let tm: Mat = IDENT
  let tlm: Mat = IDENT
  let leading = 0
  let reliable = true
  let operands: Tok[] = []

  const nums = () => operands.filter((t) => t.kind === 'num').map((t) => t.num!)
  const newLine = (tx: number, ty: number) => {
    tlm = mul([1, 0, 0, 1, tx, ty], tlm)
    tm = tlm
    reliable = true
  }
  const record = (op: ShowOp['op'], first: Tok, last: Tok) => {
    const m = mul(tm, ctm)
    out.push({ op, start: first.start, end: last.end, x: m[4], y: m[5], reliable, font, fill })
    reliable = false // vị trí chữ kế tiếp phụ thuộc bề rộng chữ vừa vẽ
  }

  for (const t of toks) {
    if (t.kind !== 'op') { operands.push(t); continue }
    const n = nums()
    switch (t.text) {
      case 'q': stack.push({ ctm, font, fill }); break
      case 'Q': {
        const st = stack.pop()
        if (st) ({ ctm, font, fill } = st)
        break
      }
      case 'Tf': font = operands.find((o) => o.kind === 'name')?.text ?? font; break
      case 'g': if (n.length >= 1) fill = [n.at(-1)!, n.at(-1)!, n.at(-1)!]; break
      case 'rg': if (n.length >= 3) fill = [n.at(-3)!, n.at(-2)!, n.at(-1)!]; break
      case 'k': if (n.length >= 4) fill = cmyk(n.slice(-4)); break
      case 'sc': case 'scn':
        // Chỉ hiểu khi toàn số (không có tên mẫu tô): 1 = xám, 3 = RGB, 4 = CMYK.
        if (operands.some((o) => o.kind === 'name')) fill = null
        else if (n.length === 1) fill = [n[0]!, n[0]!, n[0]!]
        else if (n.length === 3) fill = [n[0]!, n[1]!, n[2]!]
        else if (n.length === 4) fill = cmyk(n)
        else fill = null
        break
      case 'cm': if (n.length >= 6) ctm = mul(n.slice(-6) as Mat, ctm); break
      case 'BT': tm = tlm = IDENT; reliable = true; break
      case 'TL': if (n.length) leading = n[n.length - 1]!; break
      case 'Td': if (n.length >= 2) newLine(n[n.length - 2]!, n[n.length - 1]!); break
      case 'TD': if (n.length >= 2) { leading = -n[n.length - 1]!; newLine(n[n.length - 2]!, n[n.length - 1]!) } break
      case 'Tm': if (n.length >= 6) { tm = tlm = n.slice(-6) as Mat; reliable = true } break
      case 'T*': newLine(0, -leading); break
      case 'Tj': case 'TJ': { const o = operands[operands.length - 1]; if (o) record(t.text as 'Tj' | 'TJ', o, t); break }
      case "'": { newLine(0, -leading); const o = operands[operands.length - 1]; if (o) record("'", o, t); break }
      case '"': { newLine(0, -leading); const o = operands[operands.length - 3] ?? operands[operands.length - 1]; if (o) record('"', o, t); break }
    }
    operands = []
  }
  return out
}

/**
 * Xóa các lệnh vẽ chữ thỏa `match` và trả về luồng mới. Lệnh ' và " vẫn phải xuống dòng nên được thay bằng T*.
 * Chỉ động đến lệnh có vị trí tin cậy.
 */
export function removeShowOps(bytes: Uint8Array, ops: ShowOp[], match: (op: ShowOp) => boolean): { bytes: Uint8Array; removed: ShowOp[] } {
  const removed = ops.filter((o) => o.reliable && match(o))
  if (removed.length === 0) return { bytes, removed }
  const parts: Uint8Array[] = []
  let at = 0
  for (const o of removed) {
    parts.push(bytes.subarray(at, o.start))
    if (o.op === "'" || o.op === '"') parts.push(new TextEncoder().encode('T*'))
    at = o.end
  }
  parts.push(bytes.subarray(at))
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let k = 0
  for (const p of parts) { out.set(p, k); k += p.length }
  return { bytes: out, removed }
}
