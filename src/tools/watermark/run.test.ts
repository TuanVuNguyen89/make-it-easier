import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFDict, degrees } from 'pdf-lib'
import { ctx, pageTexts } from '../testUtils'
import { run } from './run'

const png = new Uint8Array(readFileSync('tests/fixtures/image-red.png'))
const jpg = new Uint8Array(readFileSync('tests/fixtures/image-blue.jpg'))
const make = async (n: number, rot = 0) => {
  const d = await PDFDocument.create()
  for (let i = 0; i < n; i++) d.addPage([600, 800]).setRotation(degrees(rot))
  return d.save()
}
const base = { text: 'DRAFT', size: 48, scale: 50, opacity: 30, angle: 0, ranges: '' }
const xobjects = async (b: Uint8Array, i: number) => {
  const page = (await PDFDocument.load(b)).getPage(i)
  const res = page.node.Resources()
  const xo = res?.lookup(PDFName.of('XObject'))
  return xo instanceof PDFDict ? xo.keys().length : 0
}

describe('watermark chữ', () => {
  it('xuất hiện trên mọi trang, ở giữa trang', async () => {
    const [out] = await run([await make(3)], base, ctx())
    const texts = await pageTexts(out!.data)
    expect(texts.map((t) => t.map((x) => x.str).join(''))).toEqual(['DRAFT', 'DRAFT', 'DRAFT'])
    const { x, y } = texts[0]![0]!
    expect(x).toBeGreaterThan(150)
    expect(x).toBeLessThan(300)
    expect(y).toBeGreaterThan(370)
    expect(y).toBeLessThan(400)
  })

  it('chỉ các trang chọn', async () => {
    const [out] = await run([await make(3)], { ...base, ranges: '2' }, ctx())
    const texts = await pageTexts(out!.data)
    expect(texts[0]).toEqual([])
    expect(texts[1]!.length).toBe(1)
    expect(texts[2]).toEqual([])
  })

  it('viết được tiếng Việt có dấu', async () => {
    const [out] = await run([await make(1)], { ...base, text: 'BẢN NHÁP ĐẶC BIỆT' }, ctx())
    const joined = (await pageTexts(out!.data))[0]!.map((x) => x.str).join('')
    expect(joined).toContain('BẢN NHÁP')
  })

  it('xoay 45° và trên trang xoay 90° vẫn tạo được tệp hợp lệ giữ số trang', async () => {
    const [a] = await run([await make(1)], { ...base, angle: 45 }, ctx())
    const [b] = await run([await make(1, 90)], { ...base, angle: 45 }, ctx())
    expect((await PDFDocument.load(a!.data)).getPageCount()).toBe(1)
    expect((await PDFDocument.load(b!.data)).getPageCount()).toBe(1)
  })
})

describe('watermark ảnh', () => {
  it('PNG và JPG được nhúng vào các trang chọn, tệp gốc đầu vào không bị đổi', async () => {
    const src = await make(2)
    const copy = src.slice()
    const [out] = await run([src, png], { ...base, text: '', ranges: '1' }, ctx())
    expect(await xobjects(out!.data, 0)).toBeGreaterThan(0)
    expect(await xobjects(out!.data, 1)).toBe(0)
    const [out2] = await run([await make(1), jpg], { ...base, text: '' }, ctx())
    expect(await xobjects(out2!.data, 0)).toBeGreaterThan(0)
    expect(src).toEqual(copy)
  })

  it('thứ tự đầu vào không quan trọng (ảnh trước, PDF sau)', async () => {
    const [out] = await run([png, await make(1)], { ...base, text: '' }, ctx())
    expect(await xobjects(out!.data, 0)).toBeGreaterThan(0)
  })
})

describe('watermark: lỗi đầu vào', () => {
  it('thiếu cả chữ lẫn ảnh', async () => {
    await expect(run([await make(1)], { ...base, text: '  ' }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
  it('không có PDF: invalid-pdf; hai PDF: invalid-options', async () => {
    await expect(run([png], base, ctx())).rejects.toMatchObject({ code: 'invalid-pdf' })
    await expect(run([await make(1), await make(1)], base, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
  it('độ mờ hoặc cỡ chữ sai', async () => {
    await expect(run([await make(1)], { ...base, opacity: 0 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(run([await make(1)], { ...base, size: 1 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})
