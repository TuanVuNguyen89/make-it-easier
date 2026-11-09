import { alignOffset, wrapParagraphs, type TextAlign } from './wrapText'

export interface CaretGeometry {
  /** Điểm bắt đầu chữ (mép trái, đường cơ sở dòng đầu) và hướng chữ (độ ngược chiều kim đồng hồ). */
  x: number
  baseline: number
  angle: number
  lineHeight: number
  /** Bề rộng ngắt dòng của khối (≤ 0: không ngắt). */
  wrapWidth: number
  /** Căn lề và bề rộng khối (để bù độ lệch đầu dòng khi căn giữa/phải). */
  align?: TextAlign
  blockWidth?: number
}

/**
 * Vị trí con trỏ trong `text` khi người dùng bấm vào điểm `point` (tọa độ nhìn thấy) trên khối chữ: chọn dòng theo khoảng cách
 * tới đường cơ sở, rồi chọn ký tự có mép trái gần điểm bấm nhất. Dùng đúng thuật toán ngắt dòng như khi xuất để khớp hiển thị.
 */
export function caretIndex(text: string, measure: (s: string) => number, g: CaretGeometry, point: { x: number; y: number }): number {
  const th = (-g.angle * Math.PI) / 180
  const dx = point.x - g.x
  const dy = point.y - g.baseline
  const u = dx * Math.cos(th) + dy * Math.sin(th) // dọc theo chữ
  const v = -dx * Math.sin(th) + dy * Math.cos(th) // lệch khỏi đường cơ sở dòng đầu (hướng xuống)
  const lines = wrapParagraphs(text, measure, g.wrapWidth)
  const k = Math.min(lines.length - 1, Math.max(0, Math.round(v / g.lineHeight)))

  // Chỉ số bắt đầu của dòng k trong `text`: nhảy qua từng dòng trước, bỏ khoảng trắng và tối đa một xuống dòng giữa các dòng.
  let idx = 0
  for (let j = 0; j < k; j++) {
    const at = text.indexOf(lines[j]!, idx)
    idx = (at < 0 ? idx : at) + lines[j]!.length
    while (text[idx] === ' ') idx++
    if (text[idx] === '\n') idx++
  }
  const line = lines[k] ?? ''
  const off = alignOffset(g.align, g.blockWidth ?? 0, measure(line))
  let best = 0
  let bestD = Infinity
  for (let i = 0; i <= line.length; i++) {
    const d = Math.abs(off + measure(line.slice(0, i)) - u)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return Math.min(text.length, idx + best)
}
