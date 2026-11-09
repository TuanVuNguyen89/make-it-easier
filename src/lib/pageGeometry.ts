import type { PDFPage } from 'pdf-lib'

/** Kích thước hiển thị (đã tính xoay) và hàm đổi điểm từ tọa độ nhìn thấy sang tọa độ khung trang chưa xoay. */
export function visualFrame(page: PDFPage) {
  const box = page.getCropBox()
  const r = ((page.getRotation().angle % 360) + 360) % 360
  const w = box.width
  const h = box.height
  const vw = r % 180 === 0 ? w : h
  const vh = r % 180 === 0 ? h : w
  /** (vx, vy): gốc ở góc dưới-trái của hình nhìn thấy, y hướng lên. Trả về tọa độ trong hệ của trang. */
  const toPage = (vx: number, vy: number) => {
    let x: number
    let y: number
    switch (r) {
      case 90:
        x = w - vy
        y = vx
        break
      case 180:
        x = w - vx
        y = h - vy
        break
      case 270:
        x = vy
        y = h - vx
        break
      default:
        x = vx
        y = vy
    }
    return { x: box.x + x, y: box.y + y }
  }
  /** Ngược lại của toPage: điểm trong tọa độ trang → tọa độ nhìn thấy với y tính từ mép TRÊN (hệ của chú thích). */
  const toVisual = (px: number, py: number) => {
    const x = px - box.x
    const y = py - box.y
    let vx: number
    let vyBottom: number
    switch (r) {
      case 90:
        vx = y
        vyBottom = w - x
        break
      case 180:
        vx = w - x
        vyBottom = h - y
        break
      case 270:
        vx = h - y
        vyBottom = x
        break
      default:
        vx = x
        vyBottom = y
    }
    return { x: vx, y: vh - vyBottom }
  }
  return { vw, vh, rotation: r, toPage, toVisual }
}
