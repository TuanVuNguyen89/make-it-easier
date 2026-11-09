import { ToolError } from '@/tools/types'

/** Ảnh RGBA 8 bit, không nhân trước alpha. */
export interface Bitmap {
  width: number
  height: number
  data: Uint8ClampedArray
}

export const MAX_PIXELS = 64_000_000

export function makeBitmap(width: number, height: number): Bitmap {
  if (!(width >= 1 && height >= 1) || width * height > MAX_PIXELS) {
    throw new ToolError('invalid-options', 'Image size out of range')
  }
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

export const cloneBitmap = (b: Bitmap): Bitmap => ({ width: b.width, height: b.height, data: b.data.slice() })

/** Đổi cỡ: lấy trung bình theo vùng khi thu nhỏ (không răng cưa), nội suy song tuyến khi phóng to. */
export function resize(src: Bitmap, width: number, height: number): Bitmap {
  width = Math.round(width)
  height = Math.round(height)
  if (width === src.width && height === src.height) return cloneBitmap(src)
  makeBitmap(width, height) // kiểm tra giới hạn
  return resizeAxis(resizeAxis(src, width, 'x'), height, 'y')
}

function resizeAxis(src: Bitmap, outLen: number, axis: 'x' | 'y'): Bitmap {
  const inLen = axis === 'x' ? src.width : src.height
  if (inLen === outLen) return src
  const out = axis === 'x' ? makeBitmap(outLen, src.height) : makeBitmap(src.width, outLen)
  const ratio = inLen / outLen
  const lines = axis === 'x' ? src.height : src.width
  const stride = (i: number, line: number) => (axis === 'x' ? (line * src.width + i) * 4 : (i * src.width + line) * 4)
  const outStride = (i: number, line: number) => (axis === 'x' ? (line * out.width + i) * 4 : (i * out.width + line) * 4)

  for (let o = 0; o < outLen; o++) {
    // Danh sách (chỉ số nguồn, trọng số) cho điểm ảnh đầu ra o.
    const taps: [number, number][] = []
    if (ratio > 1) {
      const a = o * ratio
      const b = a + ratio
      for (let i = Math.floor(a); i < Math.min(inLen, Math.ceil(b)); i++) taps.push([i, Math.min(b, i + 1) - Math.max(a, i)])
    } else {
      const u = (o + 0.5) * ratio - 0.5
      const i0 = Math.floor(u)
      const f = u - i0
      taps.push([Math.max(0, i0), 1 - f], [Math.min(inLen - 1, i0 + 1), f])
    }
    for (let line = 0; line < lines; line++) {
      let r = 0, g = 0, b = 0, a = 0, w = 0
      for (const [i, wt] of taps) {
        const p = stride(i, line)
        const al = src.data[p + 3]! * wt // trung bình có nhân trước alpha để viền trong suốt không bị lem màu
        r += src.data[p]! * al
        g += src.data[p + 1]! * al
        b += src.data[p + 2]! * al
        a += al
        w += wt
      }
      const q = outStride(o, line)
      if (a > 0) {
        out.data[q] = r / a
        out.data[q + 1] = g / a
        out.data[q + 2] = b / a
      }
      out.data[q + 3] = a / w
    }
  }
  return out
}

export function crop(src: Bitmap, x: number, y: number, width: number, height: number): Bitmap {
  if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width < 1 || height < 1 || x + width > src.width || y + height > src.height) {
    throw new ToolError('invalid-options', 'Crop area is outside the image')
  }
  const out = makeBitmap(width, height)
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * src.width + x) * 4
    out.data.set(src.data.subarray(from, from + width * 4), row * width * 4)
  }
  return out
}

/** Xoay theo chiều kim đồng hồ, bội số của 90 độ. */
export function rotate(src: Bitmap, degrees: number): Bitmap {
  const turns = (((degrees / 90) % 4) + 4) % 4
  if (!Number.isInteger(degrees / 90)) throw new ToolError('invalid-options', 'Rotation must be a multiple of 90')
  if (turns === 0) return cloneBitmap(src)
  const swap = turns % 2 === 1
  const out = makeBitmap(swap ? src.height : src.width, swap ? src.width : src.height)
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      let nx: number, ny: number
      if (turns === 1) [nx, ny] = [src.height - 1 - y, x]
      else if (turns === 2) [nx, ny] = [src.width - 1 - x, src.height - 1 - y]
      else [nx, ny] = [y, src.width - 1 - x]
      const from = (y * src.width + x) * 4
      out.data.set(src.data.subarray(from, from + 4), (ny * out.width + nx) * 4)
    }
  }
  return out
}

export function flip(src: Bitmap, horizontal: boolean, vertical: boolean): Bitmap {
  const out = makeBitmap(src.width, src.height)
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const nx = horizontal ? src.width - 1 - x : x
      const ny = vertical ? src.height - 1 - y : y
      out.data.set(src.data.subarray((y * src.width + x) * 4, (y * src.width + x) * 4 + 4), (ny * out.width + nx) * 4)
    }
  }
  return out
}

/** Dán ảnh lên nền trắng (JPEG không có kênh alpha). */
export function flattenOnWhite(src: Bitmap): Bitmap {
  const out = cloneBitmap(src)
  for (let i = 0; i < out.data.length; i += 4) {
    const a = out.data[i + 3]! / 255
    for (let c = 0; c < 3; c++) out.data[i + c] = out.data[i + c]! * a + 255 * (1 - a)
    out.data[i + 3] = 255
  }
  return out
}

/** Làm nét bằng unsharp mask (làm mờ hộp 3×3). amount 0..1+ */
export function sharpen(src: Bitmap, amount: number): Bitmap {
  const out = cloneBitmap(src)
  if (amount <= 0) return out
  const { width: w, height: h, data } = src
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        let sum = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += data[(Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))) * 4 + c]!
          }
        }
        out.data[p + c] = data[p + c]! + amount * (data[p + c]! - sum / 9)
      }
    }
  }
  return out
}

/** Kéo giãn độ sáng từng kênh giữa phân vị 1% và 99% (tự cân bằng màu/độ tương phản). */
export function autoLevels(src: Bitmap): Bitmap {
  const out = cloneBitmap(src)
  const lut: Uint8ClampedArray[] = []
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256)
    let n = 0
    for (let i = c; i < src.data.length; i += 4) {
      hist[src.data[i]!]!++
      n++
    }
    let lo = 0, hi = 255, acc = 0
    for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= n * 0.01) { lo = v; break } }
    acc = 0
    for (let v = 255; v >= 0; v--) { acc += hist[v]!; if (acc >= n * 0.01) { hi = v; break } }
    const table = new Uint8ClampedArray(256)
    for (let v = 0; v < 256; v++) table[v] = hi > lo ? ((v - lo) / (hi - lo)) * 255 : v
    lut.push(table)
  }
  for (let i = 0; i < out.data.length; i += 4) for (let c = 0; c < 3; c++) out.data[i + c] = lut[c]![src.data[i + c]!]!
  return out
}

const dist = (d: Uint8ClampedArray, p: number, rgb: number[]) =>
  Math.max(Math.abs(d[p]! - rgb[0]!), Math.abs(d[p + 1]! - rgb[1]!), Math.abs(d[p + 2]! - rgb[2]!))

/**
 * Xóa nền đồng màu: lấy màu nền là trung vị của các điểm ảnh ở rìa, rồi loang từ rìa vào qua các điểm
 * có màu gần nền (sai khác ≤ tolerance). Chỉ vùng nối với rìa mới bị xóa nên chủ thể giống màu nền ở giữa vẫn giữ.
 */
export function removeBackground(src: Bitmap, tolerance: number, feather = 1): Bitmap {
  const { width: w, height: h } = src
  const out = cloneBitmap(src)
  const edge: number[][] = [[], [], []]
  const push = (x: number, y: number) => {
    const p = (y * w + x) * 4
    for (let c = 0; c < 3; c++) edge[c]!.push(src.data[p + c]!)
  }
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1) }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y) }
  const bg = edge.map((v) => v.sort((a, b) => a - b)[v.length >> 1]!)

  const removed = new Uint8Array(w * h)
  const stack: number[] = []
  const tryAdd = (x: number, y: number) => {
    const i = y * w + x
    if (!removed[i] && dist(src.data, i * 4, bg) <= tolerance) {
      removed[i] = 1
      stack.push(i)
    }
  }
  for (let x = 0; x < w; x++) { tryAdd(x, 0); tryAdd(x, h - 1) }
  for (let y = 0; y < h; y++) { tryAdd(0, y); tryAdd(w - 1, y) }
  while (stack.length) {
    const i = stack.pop()!
    const x = i % w
    const y = (i / w) | 0
    if (x > 0) tryAdd(x - 1, y)
    if (x < w - 1) tryAdd(x + 1, y)
    if (y > 0) tryAdd(x, y - 1)
    if (y < h - 1) tryAdd(x, y + 1)
  }
  for (let i = 0; i < removed.length; i++) if (removed[i]) out.data[i * 4 + 3] = 0

  // Làm mềm viền: điểm ảnh sát vùng đã xóa, nếu chỉ hơi khác nền thì giảm độ đục theo mức khác biệt.
  if (feather > 0) {
    const range = Math.max(1, tolerance)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (removed[i]) continue
        const near = (x > 0 && removed[i - 1]) || (x < w - 1 && removed[i + 1]) || (y > 0 && removed[i - w]) || (y < h - 1 && removed[i + w])
        if (!near) continue
        const d = dist(src.data, i * 4, bg)
        if (d <= tolerance + range) out.data[i * 4 + 3] = Math.round(255 * Math.min(1, (d - tolerance) / range))
      }
    }
  }
  return out
}

/**
 * Vá vùng bị tô (mask khác 0): lấp dần từ mép vào trong, mỗi điểm lấy trung bình có trọng số
 * (theo khoảng cách) của các điểm đã biết trong cửa sổ, theo từng lớp để không lệch hướng.
 */
export function inpaint(src: Bitmap, mask: Uint8Array, radius = 4): Bitmap {
  const { width: w, height: h } = src
  if (mask.length !== w * h) throw new ToolError('invalid-options', 'Mask size does not match the image')
  const out = cloneBitmap(src)
  const known = new Uint8Array(w * h)
  let unknown = 0
  for (let i = 0; i < known.length; i++) {
    known[i] = mask[i] ? 0 : 1
    if (!known[i]) unknown++
  }
  if (unknown === 0) return out
  if (unknown === known.length) throw new ToolError('invalid-options', 'Mask covers the whole image')

  let frontier: number[] = []
  const adjacentKnown = (x: number, y: number) =>
    (x > 0 && known[y * w + x - 1]) || (x < w - 1 && known[y * w + x + 1]) || (y > 0 && known[(y - 1) * w + x]) || (y < h - 1 && known[(y + 1) * w + x])
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!known[y * w + x] && adjacentKnown(x, y)) frontier.push(y * w + x)

  while (frontier.length) {
    const colors = frontier.map((i) => {
      const x = i % w
      const y = (i / w) | 0
      let r = 0, g = 0, b = 0, a = 0, ws = 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !known[ny * w + nx]) continue
          const wt = 1 / (dx * dx + dy * dy + 1)
          const p = (ny * w + nx) * 4
          r += out.data[p]! * wt; g += out.data[p + 1]! * wt; b += out.data[p + 2]! * wt; a += out.data[p + 3]! * wt
          ws += wt
        }
      }
      return ws > 0 ? [r / ws, g / ws, b / ws, a / ws] : null
    })
    const next: number[] = []
    frontier.forEach((i, k) => {
      const c = colors[k]
      if (c) {
        out.data.set(c, i * 4)
        known[i] = 1
      } else next.push(i)
    })
    // Lớp tiếp theo: các điểm chưa biết vừa sát một điểm đã biết.
    const seen = new Set<number>(next)
    for (const i of frontier) {
      const x = i % w
      const y = (i / w) | 0
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (!known[j] && !seen.has(j)) { seen.add(j); next.push(j) }
      }
    }
    if (next.length === frontier.length && next.every((v, k) => v === frontier[k])) break
    frontier = next
  }
  return out
}

/** Nới rộng vùng tô thêm `radius` pixel mỗi phía (người dùng thường tô hụt mép vật thể). */
export function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice()
  const pass = (src: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(src.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let hit = 0
        for (let d = -radius; d <= radius && !hit; d++) {
          const nx = horizontal ? x + d : x
          const ny = horizontal ? y : y + d
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && src[ny * width + nx]) hit = 255
        }
        out[y * width + x] = hit
      }
    }
    return out
  }
  return pass(pass(mask, true), false)
}

/** Tô đặc một hình chữ nhật (tự cắt theo biên ảnh). */
export function fillRect(bm: Bitmap, x: number, y: number, width: number, height: number, rgba: [number, number, number, number]): void {
  const x0 = Math.max(0, Math.floor(x))
  const y0 = Math.max(0, Math.floor(y))
  const x1 = Math.min(bm.width, Math.ceil(x + width))
  const y1 = Math.min(bm.height, Math.ceil(y + height))
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) bm.data.set(rgba, (yy * bm.width + xx) * 4)
}
