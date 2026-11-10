import { describe, expect, it } from 'vitest'
import { makeBitmap, fillRect } from './imageOps'
import { findFigures } from './scanFigures'

const page = () => {
  const bm = makeBitmap(800, 1000)
  fillRect(bm, 0, 0, 800, 1000, [255, 255, 255, 255])
  return bm
}

describe('findFigures: hình minh họa trong trang quét', () => {
  it('khối hình lớn được tìm thấy đúng khung; chữ đã nhận dạng và đường kẻ nhỏ thì không', () => {
    const bm = page()
    fillRect(bm, 400, 100, 300, 350, [120, 70, 40, 255]) // hình (ảnh chụp)
    fillRect(bm, 60, 100, 280, 14, [0, 0, 0, 255]) // dòng chữ (đã nhận dạng)
    fillRect(bm, 60, 130, 280, 14, [0, 0, 0, 255])
    fillRect(bm, 60, 500, 120, 2, [0, 0, 0, 255]) // gạch chân nhỏ
    const text = [{ x0: 60, y0: 98, x1: 340, y1: 118 }, { x0: 60, y0: 128, x1: 340, y1: 148 }]
    const figs = findFigures(bm, text)
    expect(figs).toHaveLength(1)
    const f = figs[0]!
    expect(f.x0).toBeGreaterThan(380)
    expect(f.x0).toBeLessThan(420)
    expect(f.x1).toBeGreaterThan(680)
    expect(f.y0).toBeGreaterThan(80)
    expect(f.y1).toBeLessThan(470)
  })

  it('trang chỉ có chữ (đã nhận dạng hết) không có hình', () => {
    const bm = page()
    const text = []
    for (let i = 0; i < 20; i++) {
      fillRect(bm, 60, 60 + i * 30, 600, 14, [0, 0, 0, 255])
      text.push({ x0: 60, y0: 58 + i * 30, x1: 660, y1: 78 + i * 30 })
    }
    expect(findFigures(bm, text)).toEqual([])
  })

  it('chú thích chạm mép dưới hình (khung chữ lấn qua mép) bị cắt ra khỏi hình', () => {
    const bm = page()
    fillRect(bm, 400, 100, 300, 350, [120, 70, 40, 255])
    fillRect(bm, 400, 440, 300, 16, [60, 60, 60, 255]) // dòng chú thích dính sát hình
    const figs = findFigures(bm, [{ x0: 400, y0: 438, x1: 700, y1: 460 }])
    expect(figs).toHaveLength(1)
    expect(figs[0]!.y1).toBeLessThanOrEqual(440)
  })

  it('nền không trắng (giấy ngả vàng) vẫn tìm đúng hình', () => {
    const bm = makeBitmap(800, 1000)
    fillRect(bm, 0, 0, 800, 1000, [235, 220, 190, 255])
    fillRect(bm, 100, 300, 320, 380, [40, 50, 120, 255])
    expect(findFigures(bm, [])).toHaveLength(1)
  })
})
