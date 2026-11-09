import { describe, expect, it } from 'vitest'
import { autoLevels, crop, dilateMask, fillRect, flip, inpaint, makeBitmap, removeBackground, resize, rotate, sharpen, type Bitmap } from './imageOps'

/** Ảnh w×h; điểm ảnh (x,y) có R = x, G = y để kiểm tra vị trí. */
function grid(w: number, h: number): Bitmap {
  const b = makeBitmap(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.data.set([x, y, 0, 255], (y * w + x) * 4)
  return b
}
const px = (b: Bitmap, x: number, y: number) => [...b.data.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 4)]
const solid = (w: number, h: number, c: number[]) => {
  const b = makeBitmap(w, h)
  for (let i = 0; i < w * h; i++) b.data.set(c, i * 4)
  return b
}

describe('resize', () => {
  it('đổi đúng kích thước và giữ màu phẳng', () => {
    const out = resize(solid(100, 80, [200, 100, 50, 255]), 40, 30)
    expect([out.width, out.height]).toEqual([40, 30])
    expect(px(out, 20, 15)).toEqual([200, 100, 50, 255])
  })
  it('thu nhỏ lấy trung bình (không răng cưa): đen trắng xen kẽ ra xám', () => {
    const b = makeBitmap(4, 1)
    ;[0, 255, 0, 255].forEach((v, i) => b.data.set([v, v, v, 255], i * 4))
    const out = resize(b, 2, 1)
    expect(px(out, 0, 0)[0]).toBeGreaterThanOrEqual(127)
    expect(px(out, 0, 0)[0]).toBeLessThanOrEqual(128)
  })
  it('phóng to nội suy giữa các điểm', () => {
    const b = makeBitmap(2, 1)
    b.data.set([0, 0, 0, 255, 200, 200, 200, 255])
    const out = resize(b, 4, 1)
    const r = [0, 1, 2, 3].map((x) => px(out, x, 0)[0]!)
    expect(r).toEqual([...r].sort((a, c) => a - c)) // tăng dần, không nhảy bậc
    expect(r[1]).toBeGreaterThan(0)
    expect(r[2]).toBeLessThan(200)
  })
  it('viền trong suốt không làm lem màu sang điểm ảnh đục', () => {
    const b = makeBitmap(2, 1)
    b.data.set([255, 0, 0, 255, 0, 255, 0, 0]) // đỏ đục, xanh lá trong suốt
    const out = resize(b, 1, 1)
    expect(px(out, 0, 0).slice(0, 3)).toEqual([255, 0, 0])
  })
  it('từ chối kích thước không hợp lệ', () => {
    expect(() => resize(solid(2, 2, [0, 0, 0, 255]), 0, 5)).toThrowError(expect.objectContaining({ code: 'invalid-options' }))
    expect(() => resize(solid(2, 2, [0, 0, 0, 255]), 20000, 20000)).toThrowError(expect.objectContaining({ code: 'invalid-options' }))
  })
})

describe('crop / rotate / flip', () => {
  it('cắt đúng vùng', () => {
    const out = crop(grid(10, 8), 3, 2, 4, 3)
    expect([out.width, out.height]).toEqual([4, 3])
    expect(px(out, 0, 0).slice(0, 2)).toEqual([3, 2])
    expect(px(out, 3, 2).slice(0, 2)).toEqual([6, 4])
  })
  it('từ chối vùng cắt ngoài ảnh hoặc không nguyên', () => {
    expect(() => crop(grid(10, 8), 8, 0, 4, 4)).toThrowError(expect.objectContaining({ code: 'invalid-options' }))
    expect(() => crop(grid(10, 8), 0.5, 0, 2, 2)).toThrowError(expect.objectContaining({ code: 'invalid-options' }))
  })
  it('xoay 90° theo chiều kim đồng hồ: góc trên-trái sang trên-phải', () => {
    const out = rotate(grid(4, 2), 90)
    expect([out.width, out.height]).toEqual([2, 4])
    expect(px(out, 1, 0).slice(0, 2)).toEqual([0, 0]) // (0,0) -> (h-1, 0)
    expect(px(out, 1, 3).slice(0, 2)).toEqual([3, 0])
  })
  it('xoay 180° và 270°; 360° giữ nguyên', () => {
    expect(px(rotate(grid(4, 2), 180), 3, 1).slice(0, 2)).toEqual([0, 0])
    const r270 = rotate(grid(4, 2), 270)
    expect(px(r270, 0, 3).slice(0, 2)).toEqual([0, 0])
    expect(rotate(grid(4, 2), 360).data).toEqual(grid(4, 2).data)
    expect(rotate(grid(4, 2), -90).data).toEqual(r270.data)
  })
  it('4 lần xoay 90° trả về ảnh gốc; góc không phải bội số 90 bị từ chối', () => {
    let b = grid(5, 3)
    for (let i = 0; i < 4; i++) b = rotate(b, 90)
    expect(b.data).toEqual(grid(5, 3).data)
    expect(() => rotate(grid(2, 2), 45)).toThrowError(expect.objectContaining({ code: 'invalid-options' }))
  })
  it('lật ngang và dọc', () => {
    expect(px(flip(grid(4, 2), true, false), 0, 0).slice(0, 2)).toEqual([3, 0])
    expect(px(flip(grid(4, 2), false, true), 0, 0).slice(0, 2)).toEqual([0, 1])
  })
})

describe('sharpen / autoLevels', () => {
  it('làm nét tăng tương phản ở cạnh, giữ vùng phẳng', () => {
    const b = makeBitmap(6, 1)
    ;[100, 100, 100, 160, 160, 160].forEach((v, i) => b.data.set([v, v, v, 255], i * 4))
    const out = sharpen(b, 1)
    expect(px(out, 2, 0)[0]).toBeLessThan(100)
    expect(px(out, 3, 0)[0]).toBeGreaterThan(160)
    expect(px(out, 0, 0)[0]).toBe(100)
  })
  it('amount 0 không đổi gì', () => {
    expect(sharpen(grid(4, 4), 0).data).toEqual(grid(4, 4).data)
  })
  it('autoLevels kéo giãn ảnh xám nhạt ra toàn dải', () => {
    const b = makeBitmap(100, 1)
    for (let i = 0; i < 100; i++) b.data.set([100 + i, 100 + i, 100 + i, 255], i * 4)
    const out = autoLevels(b)
    expect(px(out, 0, 0)[0]).toBeLessThan(10)
    expect(px(out, 99, 0)[0]).toBeGreaterThan(245)
  })
})

describe('removeBackground', () => {
  it('xóa nền đồng màu nối với rìa, giữ chủ thể ở giữa', () => {
    const b = solid(20, 20, [250, 250, 250, 255])
    for (let y = 6; y < 14; y++) for (let x = 6; x < 14; x++) b.data.set([200, 30, 30, 255], (y * 20 + x) * 4)
    const out = removeBackground(b, 30)
    expect(px(out, 0, 0)[3]).toBe(0)
    expect(px(out, 19, 19)[3]).toBe(0)
    expect(px(out, 10, 10)).toEqual([200, 30, 30, 255])
  })
  it('vùng giống màu nền nhưng nằm trong chủ thể (không nối rìa) vẫn được giữ', () => {
    const b = solid(21, 21, [250, 250, 250, 255])
    for (let y = 3; y < 18; y++) for (let x = 3; x < 18; x++) b.data.set([20, 20, 200, 255], (y * 21 + x) * 4)
    b.data.set([250, 250, 250, 255], (10 * 21 + 10) * 4) // lỗ trắng giữa chủ thể
    const out = removeBackground(b, 20)
    expect(px(out, 10, 10)[3]).toBe(255)
    expect(px(out, 0, 0)[3]).toBe(0)
  })
  it('dung sai thấp không xóa nền gradient nhẹ, dung sai cao thì xóa', () => {
    const b = makeBitmap(10, 1)
    for (let x = 0; x < 10; x++) b.data.set([200 + x * 5, 200, 200, 255], x * 4)
    expect(removeBackground(b, 2, 0).data.filter((_, i) => i % 4 === 3).some((a) => a === 255)).toBe(true)
    expect(removeBackground(b, 60, 0).data.filter((_, i) => i % 4 === 3).every((a) => a === 0)).toBe(true)
  })
})

describe('inpaint', () => {
  it('vá vùng bị tô bằng màu xung quanh', () => {
    const b = solid(30, 30, [40, 120, 200, 255])
    const mask = new Uint8Array(900)
    for (let y = 12; y < 18; y++) for (let x = 12; x < 18; x++) { b.data.set([255, 0, 0, 255], (y * 30 + x) * 4); mask[y * 30 + x] = 255 }
    const out = inpaint(b, mask)
    for (const [x, y] of [[12, 12], [15, 15], [17, 17]] as const) {
      const [r, g, bl] = px(out, x, y)
      expect(Math.abs(r! - 40)).toBeLessThan(6)
      expect(Math.abs(g! - 120)).toBeLessThan(6)
      expect(Math.abs(bl! - 200)).toBeLessThan(6)
    }
    expect(px(out, 0, 0)).toEqual([40, 120, 200, 255]) // ngoài mask không đổi
  })
  it('nội suy mượt giữa hai màu hai bên vùng tô', () => {
    const b = makeBitmap(21, 1)
    for (let x = 0; x < 21; x++) b.data.set(x < 10 ? [0, 0, 0, 255] : x > 10 ? [200, 200, 200, 255] : [255, 255, 255, 255], x * 4)
    const mask = new Uint8Array(21)
    mask[10] = 255
    const v = px(inpaint(b, mask), 10, 0)[0]!
    expect(v).toBeGreaterThan(40)
    expect(v).toBeLessThan(160)
  })
  it('mask sai kích thước hoặc phủ cả ảnh bị từ chối; mask rỗng không đổi gì', () => {
    const b = solid(4, 4, [1, 2, 3, 255])
    expect(() => inpaint(b, new Uint8Array(3))).toThrowError(expect.objectContaining({ code: 'invalid-options' }))
    expect(() => inpaint(b, new Uint8Array(16).fill(255))).toThrowError(expect.objectContaining({ code: 'invalid-options' }))
    expect(inpaint(b, new Uint8Array(16)).data).toEqual(b.data)
  })
})

describe('dilateMask', () => {
  it('nới đều mỗi phía theo bán kính và không đổi mask gốc', () => {
    const m = new Uint8Array(9 * 9)
    m[4 * 9 + 4] = 255
    const out = dilateMask(m, 9, 9, 2)
    const on = (x: number, y: number) => out[y * 9 + x] === 255
    expect(on(2, 2) && on(6, 6) && on(4, 2) && on(2, 4)).toBe(true) // hình vuông 5×5 quanh điểm
    expect(on(1, 4) || on(7, 4) || on(4, 1) || on(4, 7)).toBe(false)
    expect(m.filter(Boolean)).toHaveLength(1)
  })
  it('bán kính 0 giữ nguyên; không tràn ra ngoài biên', () => {
    const m = new Uint8Array(16)
    m[0] = 255
    expect(dilateMask(m, 4, 4, 0)).toEqual(m)
    expect(dilateMask(m, 4, 4, 1).filter(Boolean)).toHaveLength(4)
  })
})

describe('fillRect', () => {
  it('tô đúng vùng, cắt theo biên, không đụng chỗ khác', () => {
    const b = solid(10, 10, [255, 255, 255, 255])
    fillRect(b, 2, 3, 4, 2, [0, 0, 0, 255])
    expect(px(b, 2, 3)).toEqual([0, 0, 0, 255])
    expect(px(b, 5, 4)).toEqual([0, 0, 0, 255])
    expect(px(b, 6, 4)).toEqual([255, 255, 255, 255])
    expect(px(b, 2, 5)).toEqual([255, 255, 255, 255])
    fillRect(b, -5, -5, 8, 8, [1, 2, 3, 255]) // vượt biên không lỗi
    expect(px(b, 0, 0)).toEqual([1, 2, 3, 255])
    expect(px(b, 3, 3)).toEqual([0, 0, 0, 255])
  })
})
