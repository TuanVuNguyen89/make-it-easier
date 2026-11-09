import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { decodeImage } from '@/lib/image'
import type { Bitmap } from '@/lib/imageOps'
import { rasterizePdf } from '@/lib/pdfRaster'
import { ctx, pageTexts } from '../testUtils'
import { run } from './run'

async function twoPages() {
  const d = await PDFDocument.create()
  const f = await d.embedFont(StandardFonts.HelveticaBold)
  d.addPage([400, 300]).drawText('SECRET 12345', { x: 40, y: 200, size: 32, font: f, color: rgb(0, 0, 0) })
  d.addPage([400, 300]).drawText('Public page', { x: 40, y: 200, size: 32, font: f, color: rgb(0, 0, 0) })
  return d.save()
}
async function render(bytes: Uint8Array, page: number): Promise<Bitmap> {
  let png: Uint8Array | undefined
  await rasterizePdf(bytes, { dpi: 72, format: 'png' }, (i, _t, data) => { if (i === page) png = data }, new AbortController().signal)
  return decodeImage(png!)
}
const px = (b: Bitmap, x: number, y: number) => b.data[(y * b.width + x) * 4]!
const red = (page = 0, x = 30, y = 50, w = 300, h = 60) => ({ id: 'r', page, type: 'redact' as const, x, y, w, h })

describe('redact', () => {
  it('chữ trong vùng che không còn trong tệp (không chỉ bị phủ), vùng che đen kịt, ngoài vùng vẫn trắng', async () => {
    const src = await twoPages()
    expect((await pageTexts(src))[0]!.map((t) => t.str).join('')).toContain('SECRET 12345')
    const [out] = await run([src], { annotations: [red()] }, ctx())
    expect(out!.name).toBe('redacted.pdf')
    const texts = await pageTexts(out!.data)
    expect(texts[0]).toEqual([]) // trang đã biên tập không còn chữ nào để trích xuất
    // chuỗi bí mật không còn ở bất kỳ đâu trong byte của tệp (kể cả luồng nén, nên kiểm tra thêm bằng cách giải nén ở dưới)
    expect(Buffer.from(out!.data).includes('SECRET')).toBe(false)
    const b = await render(out!.data, 0)
    expect([b.width, b.height]).toEqual([400, 300])
    expect(px(b, 100, 80)).toBeLessThan(10) // giữa vùng che: đen
    expect(px(b, 380, 20)).toBeGreaterThan(245) // ngoài vùng che: trắng
  })

  it('trang không bị che giữ nguyên dạng vector (vẫn chọn/tìm được chữ), thứ tự trang giữ nguyên', async () => {
    const [out] = await run([await twoPages()], { annotations: [red(0)] }, ctx())
    const doc = await PDFDocument.load(out!.data)
    expect(doc.getPageCount()).toBe(2)
    const texts = await pageTexts(out!.data)
    expect(texts[0]).toEqual([])
    expect(texts[1]!.map((t) => t.str).join('')).toContain('Public page')
  })

  it('che trang sau, nhiều vùng trên một trang, và bản gốc không đổi', async () => {
    const src = await twoPages()
    const copy = src.slice()
    const [out] = await run([src], { annotations: [red(1, 10, 10, 50, 50), red(1, 200, 100, 100, 100)] }, ctx())
    const texts = await pageTexts(out!.data)
    expect(texts[0]!.map((t) => t.str).join('')).toContain('SECRET 12345') // trang 1 giữ chữ
    expect(texts[1]).toEqual([])
    const b = await render(out!.data, 1)
    expect(px(b, 30, 30)).toBeLessThan(10)
    expect(px(b, 250, 150)).toBeLessThan(10)
    expect(px(b, 120, 60)).toBeGreaterThan(245)
    expect(src).toEqual(copy)
  })

  it('trang xoay: vùng che theo tọa độ nhìn thấy', async () => {
    const d = await PDFDocument.create()
    d.addPage([400, 300]).setRotation({ type: 'degrees', angle: 90 } as never)
    const [out] = await run([await d.save()], { annotations: [red(0, 10, 10, 60, 40)] }, ctx())
    const b = await render(out!.data, 0)
    expect([b.width, b.height]).toEqual([300, 400]) // trang xoay 90° hiển thị dọc
    expect(px(b, 30, 25)).toBeLessThan(10) // góc trên-trái nhìn thấy bị che
    expect(px(b, 250, 350)).toBeGreaterThan(245)
  })

  it('không có vùng che, trang sai, tọa độ sai: invalid-options; PDF có mật khẩu: encrypted; hủy: aborted', async () => {
    const src = await twoPages()
    await expect(run([src], { annotations: [] }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(run([src], { annotations: [{ id: 'x', page: 0, type: 'whiteout', x: 0, y: 0, w: 1, h: 1 }] }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(run([src], { annotations: [red(9)] }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(run([src], { annotations: [red(0, NaN)] }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(run([new Uint8Array(readFileSync('tests/fixtures/encrypted-secret.pdf'))], { annotations: [red()] }, ctx())).rejects.toMatchObject({ code: 'encrypted' })
    const ac = new AbortController()
    ac.abort()
    await expect(run([src], { annotations: [red()] }, { progress: () => {}, signal: ac.signal })).rejects.toMatchObject({ code: 'aborted' })
  })
})
