import { describe, expect, it } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import { ctx, pageTexts } from '../testUtils'
import { run } from './run'

const make = async (n: number, rot: Record<number, number> = {}) => {
  const d = await PDFDocument.create()
  for (let i = 0; i < n; i++) d.addPage([600, 800]).setRotation(degrees(rot[i] ?? 0))
  return d.save()
}
const base = { position: 'bottom-center', format: 'n' as const, start: 1, size: 11, ranges: '' }

describe('page-numbers', () => {
  it('đánh số mọi trang, giữa dưới', async () => {
    const [out] = await run([await make(3)], base, ctx())
    const texts = await pageTexts(out!.data)
    expect(texts.map((t) => t[0]!.str)).toEqual(['1', '2', '3'])
    const { x, y } = texts[0]![0]!
    expect(x).toBeGreaterThan(280)
    expect(x).toBeLessThan(320)
    expect(y).toBeCloseTo(28, 0)
  })

  it('vị trí trên-phải và trên-trái', async () => {
    const [r] = await run([await make(1)], { ...base, position: 'top-right' }, ctx())
    const [l] = await run([await make(1)], { ...base, position: 'top-left' }, ctx())
    const pr = (await pageTexts(r!.data))[0]![0]!
    const pl = (await pageTexts(l!.data))[0]![0]!
    expect(pr.x).toBeGreaterThan(540)
    expect(pr.y).toBeGreaterThan(740)
    expect(pl.x).toBeCloseTo(28, 0)
  })

  it('định dạng "n / tổng", số bắt đầu tùy chọn và chỉ các trang chọn', async () => {
    const [out] = await run([await make(4)], { ...base, format: 'n-of-total', start: 5, ranges: '2-3' }, ctx())
    const texts = await pageTexts(out!.data)
    expect(texts[0]).toEqual([])
    expect(texts[1]![0]!.str).toBe('6 / 8')
    expect(texts[2]![0]!.str).toBe('7 / 8')
    expect(texts[3]).toEqual([])
  })

  it('trang xoay 90°: số vẫn nằm ở mép dưới nhìn thấy (cạnh phải của khung chưa xoay)', async () => {
    const [out] = await run([await make(1, { 0: 90 })], base, ctx())
    const it0 = (await pageTexts(out!.data))[0]![0]!
    expect(it0.str).toBe('1')
    // mép dưới nhìn thấy của trang xoay 90° (theo chiều kim đồng hồ) là cạnh phải của khung gốc
    expect(it0.x).toBeGreaterThan(560)
  })

  it('từ chối vị trí hoặc cỡ chữ sai', async () => {
    await expect(run([await make(1)], { ...base, position: 'middle' }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(run([await make(1)], { ...base, size: 2 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(run([await make(1)], { ...base, start: -1 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})
