import { toLines, type PageText } from './pdfText'

/**
 * Một đoạn chữ có thể chọn và sửa: các đoạn pdf.js liền nhau trên cùng một dòng được gộp lại.
 * Khung bao nằm trong hệ trục của chữ: gốc (x, baseline), trục u dọc theo chữ, quay `angle` so với màn hình.
 */
export interface Segment {
  /** Điểm bắt đầu của chữ (mép trái đường cơ sở) theo tọa độ nhìn thấy (gốc trên-trái, y hướng xuống). */
  x: number
  baseline: number
  /** Hướng chữ, độ ngược chiều kim đồng hồ (0 = nằm ngang). */
  angle: number
  /** Chiều dài dọc theo chữ và chiều cao khung (từ đỉnh chữ đến dưới đường cơ sở). */
  w: number
  h: number
  size: number
  text: string
  /** Các phần (mỗi dòng/đoạn pdf.js một phần) tạo nên đoạn này; dùng để tìm đúng lệnh vẽ chữ cần xóa. */
  parts: Part[]
}

/** Một dải chữ trên một đường cơ sở: điểm bắt đầu (x, baseline) và chiều dài dọc theo chữ. */
export interface Part {
  x: number
  baseline: number
  w: number
}

/** Phần khung phía trên và dưới đường cơ sở, tính theo cỡ chữ. */
export const ASCENT = 0.92
export const DESCENT = 0.33

/** Điểm (tọa độ nhìn thấy) có nằm trên một phần chữ không: dọc theo chữ trong [0, w] và lệch đường cơ sở không quá `tol`. */
export function pointInPart(pt: { x: number; y: number }, part: Part, angle: number, tol = 1.5): boolean {
  const th = (-angle * Math.PI) / 180
  const dx = pt.x - part.x
  const dy = pt.y - part.baseline
  const u = dx * Math.cos(th) + dy * Math.sin(th)
  const v = -dx * Math.sin(th) + dy * Math.cos(th)
  return u >= -tol && u <= part.w + tol && Math.abs(v) <= tol
}

/** Bốn góc của khung trong tọa độ nhìn thấy (đã tính hướng chữ). */
export function segmentCorners(
  s: Pick<Segment, 'x' | 'baseline' | 'angle' | 'w' | 'size'> & { lines?: number; lineHeight?: number },
  pad = 0,
): [number, number][] {
  const extra = ((s.lines ?? 1) - 1) * (s.lineHeight ?? s.size * 1.2) // thêm chiều cao của các dòng sau dòng đầu
  const th = (-s.angle * Math.PI) / 180 // góc theo chiều kim đồng hồ trên màn hình
  const d = [Math.cos(th), Math.sin(th)] // dọc theo chữ
  const n = [-Math.sin(th), Math.cos(th)] // vuông góc, hướng "xuống" so với chữ
  const at = (u: number, v: number): [number, number] => [s.x + u * d[0]! + v * n[0]!, s.baseline + u * d[1]! + v * n[1]!]
  return [at(-pad, -s.size * ASCENT - pad), at(s.w + pad, -s.size * ASCENT - pad), at(s.w + pad, s.size * DESCENT + extra + pad), at(-pad, s.size * DESCENT + extra + pad)]
}

/** Dựng các đoạn chữ sửa được của một trang. Hai đoạn cách nhau xa hơn ~1,5 lần cỡ chữ (cột, ô bảng) là hai đoạn riêng. */
export function buildSegments(page: PageText): Segment[] {
  const out: Segment[] = []
  for (const line of toLines(page.runs)) {
    let group: typeof line.runs = []
    const flush = () => {
      if (!group.length) return
      const first = group[0]!
      const last = group[group.length - 1]!
      const size = Math.max(...group.map((r) => r.size))
      let text = ''
      group.forEach((r, i) => {
        const prev = group[i - 1]
        if (prev && r.x - (prev.x + prev.w) > r.size * 0.2 && !text.endsWith(' ') && !r.str.startsWith(' ')) text += ' '
        text += r.str
      })
      out.push({
        x: first.x,
        baseline: first.y,
        angle: first.angle,
        w: first.angle === 0 ? last.x + last.w - first.x : first.w,
        h: size * (ASCENT + DESCENT),
        size,
        text: text.trim(),
        parts: [{ x: first.x, baseline: first.y, w: first.angle === 0 ? last.x + last.w - first.x : first.w }],
      })
      group = []
    }
    for (const r of line.runs) {
      const prev = group[group.length - 1]
      // Chữ không nằm ngang: mỗi đoạn là một khung riêng (không đoán thứ tự đọc theo trục xiên).
      if (prev && (r.angle !== 0 || prev.angle !== 0 || r.x - (prev.x + prev.w) > Math.max(prev.size * 1.5, 12))) flush()
      group.push(r)
    }
    flush()
  }
  return out.filter((s) => s.text)
}

const BULLET = /^([•·▪◦‣\-–*]|\d{1,3}[.)])\s+/

/** Một khối đoạn văn: nhiều dòng liền nhau cùng căn lề, cùng cỡ chữ, khoảng cách dòng đều. */
export interface Block extends Segment {
  lines: number
  /** Khoảng cách giữa hai đường cơ sở liền nhau. */
  lineHeight: number
}

/**
 * Gom các dòng thành khối đoạn văn để sửa cả đoạn một lần (như trình soạn thảo): dòng sau thuộc khối nếu cùng hướng ngang,
 * cùng cỡ chữ, thẳng mép trái với khối (cho phép dòng đầu thụt vào), cách dòng trước khoảng 1–1,65 lần cỡ chữ và đều với
 * khoảng cách đã có. Dòng mở đầu bằng dấu đầu dòng hoặc số thứ tự luôn bắt đầu khối mới; dòng trước ngắn hơn hẳn các dòng
 * khác của khối (kết thúc đoạn) cũng chặn việc nối tiếp.
 */
export function buildBlocks(page: PageText): Block[] {
  const lines = buildSegments(page).sort((a, b) => a.baseline - b.baseline || a.x - b.x)
  const blocks: Block[] = []
  for (const s of lines) {
    let target: Block | undefined
    let best = Infinity
    for (const b of blocks) {
      if (s.angle !== 0 || b.angle !== 0) continue
      const last = b.parts[b.parts.length - 1]!
      const gap = s.baseline - last.baseline
      if (gap <= 0 || gap < s.size * 0.9 || gap > s.size * 1.65 || Math.abs(s.size - b.size) > 0.8) continue
      if (b.lines > 1 && Math.abs(gap - b.lineHeight) > Math.max(1.5, b.lineHeight * 0.15)) continue
      // Thẳng mép trái; riêng khối mới có một dòng thì dòng đầu có thể thụt vào.
      const aligned = Math.abs(s.x - b.x) <= s.size * 0.5 || (b.lines === 1 && s.x - b.x <= s.size * 3 && s.x >= b.x - s.size * 0.5)
      if (!aligned || BULLET.test(s.text)) continue
      // Dòng trước phải dài gần hết bề rộng khối thì mới còn "tiếp tục" (dòng ngắn là cuối đoạn), và đủ dài để là dòng văn bản
      // chứ không phải ô bảng (một cột số liệu có các hàng ngắn, cách đều nhau, thẳng mép như đoạn văn).
      if (last.w < b.w * 0.6 || last.w < s.size * 6) continue
      if (gap < best) {
        best = gap
        target = b
      }
    }
    if (target) {
      const last = target.parts[target.parts.length - 1]!
      target.lineHeight = target.lines === 1 ? s.baseline - last.baseline : target.lineHeight
      target.lines += 1
      target.text = `${target.text} ${s.text}`
      target.parts.push(s.parts[0]!)
      target.w = Math.max(target.w, s.x - target.x + s.w, ...target.parts.map((p) => p.x - target.x + p.w))
      target.h = (target.lines - 1) * target.lineHeight + s.size * (ASCENT + DESCENT)
    } else blocks.push({ ...s, parts: [...s.parts], lines: 1, lineHeight: s.size * 1.2 })
  }
  return blocks
}
