import type { Bitmap } from './imageOps'

export interface PxBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Tìm các hình (ảnh chụp, hình vẽ, chữ viết tay) trong một trang quét: lấy điểm ảnh khác nền, bỏ các khung chữ đã nhận dạng
 * (chữ thành chữ thật nên không còn cần trong ảnh), gom thành mảng liền nhau và giữ những mảng đủ lớn. Trả về khung theo pixel ảnh.
 */
export function findFigures(bm: Bitmap, textBoxes: PxBox[]): PxBox[] {
  const { width: W, height: H, data } = bm
  // Độ sáng từng điểm và độ sáng nền (giá trị phổ biến nhất).
  const lum = new Uint8Array(W * H)
  const hist = new Uint32Array(32)
  for (let i = 0; i < W * H; i++) {
    const a = data[i * 4 + 3]! / 255
    const l = Math.round((0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!) * a + 255 * (1 - a))
    lum[i] = l
    hist[l >> 3]!++
  }
  let bgBucket = 31
  for (let b = 0; b < 32; b++) if (hist[b]! > hist[bgBucket]!) bgBucket = b
  const bg = bgBucket * 8 + 4
  const ink = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) ink[i] = Math.abs(lum[i]! - bg) > 40 ? 1 : 0
  // Bỏ chữ đã nhận dạng (mở rộng vài pixel để lấy cả nét thò ra).
  for (const b of textBoxes) {
    const x0 = Math.max(0, Math.floor(b.x0) - 3)
    const x1 = Math.min(W, Math.ceil(b.x1) + 3)
    const y0 = Math.max(0, Math.floor(b.y0) - 3)
    const y1 = Math.min(H, Math.ceil(b.y1) + 3)
    for (let y = y0; y < y1; y++) ink.fill(0, y * W + x0, y * W + x1)
  }
  // Lưới ô: ô có ≥ 6% điểm mực; nở 2 ô để nối các mảng đứt đoạn của một hình.
  const cell = Math.max(4, Math.round(W / 160))
  const gw = Math.ceil(W / cell)
  const gh = Math.ceil(H / cell)
  const grid = new Uint8Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let n = 0
      let total = 0
      for (let y = gy * cell; y < Math.min(H, (gy + 1) * cell); y++) for (let x = gx * cell; x < Math.min(W, (gx + 1) * cell); x++) { total++; n += ink[y * W + x]! }
      grid[gy * gw + gx] = n >= total * 0.06 ? 1 : 0
    }
  }
  const R = 2
  const dil = new Uint8Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    if (!grid[gy * gw + gx]) continue
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = gx + dx
      const y = gy + dy
      if (x >= 0 && y >= 0 && x < gw && y < gh) dil[y * gw + x] = 1
    }
  }
  // Thành phần liên thông (BFS) và lọc theo kích thước.
  const seen = new Uint8Array(gw * gh)
  const out: PxBox[] = []
  for (let s = 0; s < gw * gh; s++) {
    if (!dil[s] || seen[s]) continue
    const stack = [s]
    seen[s] = 1
    let minX = gw, minY = gh, maxX = 0, maxY = 0, inkCells = 0
    while (stack.length) {
      const c = stack.pop()!
      const cx = c % gw
      const cy = (c / gw) | 0
      if (grid[c]) inkCells++
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= gw || y >= gh) continue
        const n = y * gw + x
        if (dil[n] && !seen[n]) { seen[n] = 1; stack.push(n) }
      }
    }
    // Bỏ phần nở ra ngoài mảng thật (R ô mỗi phía) rồi lọc: đủ lớn (≥ 3% diện tích ảnh, mỗi cạnh ≥ 0,4 inch ở 150 dpi), không quá dẹt.
    let x0 = Math.max(0, (minX + R) * cell)
    let y0 = Math.max(0, (minY + R) * cell)
    let x1 = Math.min(W, (maxX - R + 1) * cell)
    let y1 = Math.min(H, (maxY - R + 1) * cell)
    // Khung chữ chạm mép hình (chú thích ngay dưới/trên, chữ bên cạnh) bị cắt ra ngoài để hình không lẫn nửa dòng chữ.
    for (const b of textBoxes) {
      if (b.x1 <= x0 || b.x0 >= x1 || b.y1 <= y0 || b.y0 >= y1) continue
      // Chữ nằm trọn trong hình là một phần của hình (chữ in trên tài liệu cổ...): giữ nguyên, chỉ cắt khung chữ lấn qua mép.
      if (b.x0 >= x0 - 2 && b.x1 <= x1 + 2 && b.y0 >= y0 - 2 && b.y1 <= y1 + 2) continue
      const cy = (b.y0 + b.y1) / 2
      const cx = (b.x0 + b.x1) / 2
      const hh = y1 - y0
      const ww = x1 - x0
      if (cy > y1 - hh * 0.2) y1 = Math.min(y1, Math.floor(b.y0))
      else if (cy < y0 + hh * 0.2) y0 = Math.max(y0, Math.ceil(b.y1))
      else if (cx > x1 - ww * 0.2) x1 = Math.min(x1, Math.floor(b.x0))
      else if (cx < x0 + ww * 0.2) x0 = Math.max(x0, Math.ceil(b.x1))
    }
    // Dòng chữ chiếm ≥ 50% bề rộng và nằm sát mép trên/dưới là chú thích bị dính vào hình (do nét gạch chân ngay dưới chữ): cắt bỏ.
    const lineSpans = (lo: number, hi: number) => textBoxes.filter((b) => b.y1 > lo && b.y0 < hi && b.x1 > x0 && b.x0 < x1).reduce((n, b) => n + Math.min(b.x1, x1) - Math.max(b.x0, x0), 0)
    for (let guard = 0; guard < 4; guard++) {
      const hh = y1 - y0
      const bottom = textBoxes.filter((b) => b.y0 >= y1 - hh * 0.12 && b.y1 <= y1 + 8 && b.x1 > x0 && b.x0 < x1)
      const top = textBoxes.filter((b) => b.y1 <= y0 + hh * 0.12 && b.y0 >= y0 - 8 && b.x1 > x0 && b.x0 < x1)
      const lowest = bottom.length ? Math.min(...bottom.map((b) => b.y0)) : null
      const highest = top.length ? Math.max(...top.map((b) => b.y1)) : null
      if (lowest !== null && lineSpans(lowest - 2, y1 + 8) >= (x1 - x0) * 0.5) y1 = Math.min(y1, Math.floor(lowest) - 1)
      else if (highest !== null && lineSpans(y0 - 8, highest + 2) >= (x1 - x0) * 0.5) y0 = Math.max(y0, Math.ceil(highest) + 1)
      else break
    }
    const w = x1 - x0
    const h = y1 - y0
    if (w < 60 || h < 60 || w * h < W * H * 0.03 || Math.max(w / h, h / w) > 8 || inkCells < 12) continue
    out.push({ x0, y0, x1, y1 })
  }
  return out.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
}
