import { loadPdf } from '@/lib/pdf'
import { parseRanges } from '@/lib/ranges'
import { ToolError, type RunFn } from '../types'

const MM = 72 / 25.4
const MIN_SIZE = 10 // điểm

interface Options {
  ranges: string
  top: number
  right: number
  bottom: number
  left: number
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Cắt lề (mm) theo hướng nhìn thấy; đặt CropBox nên nội dung gốc vẫn còn trong file. */
export const run: RunFn<Options> = async (inputs, options, ctx) => {
  const doc = await loadPdf(inputs[0]!)
  const m = { top: num(options.top), right: num(options.right), bottom: num(options.bottom), left: num(options.left) }
  if (Object.values(m).some((v) => v < 0)) throw new ToolError('invalid-options', 'Negative margin')
  if (Object.values(m).every((v) => v === 0)) throw new ToolError('invalid-options', 'No margin to crop')
  const targets = options.ranges?.trim() ? parseRanges(options.ranges, doc.getPageCount()) : doc.getPageIndices()

  for (const i of new Set(targets)) {
    const page = doc.getPage(i)
    const r = ((page.getRotation().angle % 360) + 360) % 360
    // Đổi lề nhìn thấy (trên/phải/dưới/trái) sang lề của khung trang chưa xoay.
    const sides = [m.top, m.right, m.bottom, m.left].map((v) => v * MM) // theo thứ tự nhìn thấy
    const shift = r / 90 // số bước quay theo chiều kim đồng hồ
    // box[k] là lề của cạnh k (0 trên, 1 phải, 2 dưới, 3 trái) trong hệ trang chưa xoay.
    const box = [0, 1, 2, 3].map((k) => sides[(k + shift) % 4]!)
    const cur = page.getCropBox()
    const [top, right, bottom, left] = box as [number, number, number, number]
    const w = cur.width - left - right
    const h = cur.height - top - bottom
    if (w < MIN_SIZE || h < MIN_SIZE) throw new ToolError('invalid-options', 'Margins leave no page area')
    page.setCropBox(cur.x + left, cur.y + bottom, w, h)
  }
  ctx.progress(1)
  return [{ name: 'cropped.pdf', mime: 'application/pdf', data: await doc.save() }]
}
