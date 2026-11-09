import { describe, expect, it } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import { ctx } from '../testUtils'
import { run } from './run'

const MM = 72 / 25.4
const make = async (rotations: number[] = [0, 0, 0]) => {
  const d = await PDFDocument.create()
  for (const r of rotations) d.addPage([600, 800]).setRotation(degrees(r))
  return d.save()
}
const box = async (b: Uint8Array, i: number) => (await PDFDocument.load(b)).getPage(i).getCropBox()
const base = { ranges: '', top: 0, right: 0, bottom: 0, left: 0 }

describe('crop-pages', () => {
  it('cắt đều 10 mm quanh mọi trang', async () => {
    const [out] = await run([await make()], { ...base, top: 10, right: 10, bottom: 10, left: 10 }, ctx())
    const b = await box(out!.data, 1)
    expect(b.x).toBeCloseTo(10 * MM, 3)
    expect(b.y).toBeCloseTo(10 * MM, 3)
    expect(b.width).toBeCloseTo(600 - 20 * MM, 3)
    expect(b.height).toBeCloseTo(800 - 20 * MM, 3)
  })

  it('chỉ cắt các trang chọn', async () => {
    const [out] = await run([await make()], { ...base, ranges: '2', left: 20 }, ctx())
    expect((await box(out!.data, 0)).width).toBe(600)
    expect((await box(out!.data, 1)).width).toBeCloseTo(600 - 20 * MM, 3)
    expect((await box(out!.data, 2)).width).toBe(600)
  })

  it('lề nhìn thấy "trên" trên trang xoay 90° nằm ở cạnh trái của khung chưa xoay', async () => {
    const [out] = await run([await make([90])], { ...base, top: 20 }, ctx())
    const b = await box(out!.data, 0)
    expect(b.x).toBeCloseTo(20 * MM, 3)
    expect(b.width).toBeCloseTo(600 - 20 * MM, 3)
    expect(b.height).toBe(800)
  })

  it('lề nhìn thấy "trên" trên trang xoay 180° là cạnh dưới của khung chưa xoay', async () => {
    const [out] = await run([await make([180])], { ...base, top: 20 }, ctx())
    const b = await box(out!.data, 0)
    expect(b.y).toBeCloseTo(20 * MM, 3)
    expect(b.height).toBeCloseTo(800 - 20 * MM, 3)
  })

  it('từ chối khi không cắt gì, khi lề âm hoặc lề nuốt hết trang', async () => {
    await expect(run([await make()], base, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(run([await make()], { ...base, top: -5 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(run([await make()], { ...base, left: 150, right: 150 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})
