// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GlobalFonts, createCanvas } from '@napi-rs/canvas'
import { PDFDocument } from 'pdf-lib'
import { ctx, pageTexts } from '../testUtils'
import { run } from './run'

GlobalFonts.registerFromPath('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf', 'DejaVu Sans')

/** Ảnh chữ đen trên nền trắng, mỗi dòng ở một hàng. */
function textImage(lines: string[], w = 1000, size = 56): { bytes: Uint8Array; w: number; h: number } {
  const h = 60 + lines.length * (size + 40)
  const c = createCanvas(w, h)
  const g = c.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#000'
  g.font = `${size}px "DejaVu Sans"`
  g.textBaseline = 'top'
  lines.forEach((l, i) => g.fillText(l, 40, 40 + i * (size + 40)))
  return { bytes: new Uint8Array(c.toBuffer('image/png')), w, h }
}
const words = async (b: Uint8Array) => (await pageTexts(b)).map((p) => p.map((i) => i.str.toLowerCase()).join(' '))

describe('ocr', () => {
  it('ảnh tiếng Anh: ra PDF một trang có lớp chữ chọn được, đúng từ và đúng vị trí', async () => {
    const img = textImage(['Hello World', 'Invoice 2024'])
    const [out] = await run([img.bytes], { language: 'eng' }, ctx())
    expect(out!.name).toBe('ocr.pdf')
    const doc = await PDFDocument.load(out!.data)
    expect(doc.getPageCount()).toBe(1)
    const text = (await words(out!.data))[0]!
    expect(text).toContain('hello')
    expect(text).toContain('world')
    expect(text).toContain('invoice')
    expect(text).toContain('2024')
    // "Hello" ở dòng đầu, sát lề trái; các từ dòng hai nằm thấp hơn (y PDF nhỏ hơn)
    const items = (await pageTexts(out!.data))[0]!
    const hello = items.find((i) => i.str.toLowerCase().includes('hello'))!
    const invoice = items.find((i) => i.str.toLowerCase().includes('invoice'))!
    const pageW = doc.getPage(0).getWidth()
    expect(hello.x).toBeLessThan(pageW * 0.12)
    expect(invoice.y).toBeLessThan(hello.y)
  }, 60_000)

  it('ảnh tiếng Việt có dấu được nhận dạng', async () => {
    const img = textImage(['Xin chào Việt Nam', 'Hà Nội thủ đô'])
    const [out] = await run([img.bytes], { language: 'vie' }, ctx())
    const text = (await words(out!.data))[0]!
    const hit = ['xin', 'chào', 'việt', 'nam', 'hà', 'nội', 'thủ', 'đô'].filter((w) => text.includes(w))
    expect(hit.length, `nhận được: ${text}`).toBeGreaterThanOrEqual(6)
    expect(text).toContain('việt') // dấu thanh và dấu mũ được giữ
  }, 60_000)

  it('ảnh tiếng Đức có ä ö ü ß được nhận dạng', async () => {
    const img = textImage(['Größe Straße Müller', 'Schöne Grüße aus Köln'])
    const [out] = await run([img.bytes], { language: 'deu' }, ctx())
    const text = (await words(out!.data))[0]!
    const hit = ['größe', 'straße', 'müller', 'schöne', 'grüße', 'aus', 'köln'].filter((w) => text.includes(w))
    expect(hit.length, `nhận được: ${text}`).toBeGreaterThanOrEqual(6)
    expect(text).toMatch(/[äöüß]/) // dấu của tiếng Đức được giữ
  }, 60_000)

  it('PDF quét (trang chỉ là ảnh): giữ nguyên số trang và hình, thêm lớp chữ tìm kiếm được', async () => {
    const img = textImage(['Scanned page one'])
    const src = await PDFDocument.create()
    const png = await src.embedPng(img.bytes)
    const p1 = src.addPage([500, 500 * (img.h / img.w)])
    p1.drawImage(png, { x: 0, y: 0, width: p1.getWidth(), height: p1.getHeight() })
    const p2 = src.addPage([500, 500 * (img.h / img.w)])
    p2.drawImage(await src.embedPng(textImage(['Second sheet here']).bytes), { x: 0, y: 0, width: p2.getWidth(), height: p2.getHeight() })
    const scanned = await src.save()
    expect((await pageTexts(scanned)).every((p) => p.length === 0)).toBe(true) // trước OCR: không có chữ

    const [out] = await run([scanned], { language: 'eng' }, ctx())
    expect((await PDFDocument.load(out!.data)).getPageCount()).toBe(2)
    const t = await words(out!.data)
    expect(t[0]).toContain('scanned')
    expect(t[1]).toContain('second')
    // hình gốc vẫn còn (tệp không nhỏ đi so với bản quét)
    expect(out!.data.byteLength).toBeGreaterThanOrEqual(scanned.byteLength)
  }, 90_000)

  it('trang trắng không có chữ: no-text và không có đầu ra', async () => {
    const c = createCanvas(400, 300)
    const g = c.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 400, 300)
    await expect(run([new Uint8Array(c.toBuffer('image/png'))], { language: 'eng' }, ctx())).rejects.toMatchObject({ code: 'no-text' })
  }, 60_000)

  it('ngôn ngữ sai: invalid-options; không phải ảnh: invalid-image; PDF có mật khẩu: encrypted; hủy: aborted', async () => {
    const img = textImage(['Hello'])
    await expect(run([img.bytes], { language: 'fra' as never }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(run([new Uint8Array(readFileSync('tests/fixtures/sample.txt'))], { language: 'eng' }, ctx())).rejects.toMatchObject({ code: 'invalid-image' })
    await expect(run([new Uint8Array(readFileSync('tests/fixtures/encrypted-secret.pdf'))], { language: 'eng' }, ctx())).rejects.toMatchObject({ code: 'encrypted' })
    const ac = new AbortController()
    ac.abort()
    await expect(run([img.bytes], { language: 'eng' }, { progress: () => {}, signal: ac.signal })).rejects.toMatchObject({ code: 'aborted' })
  }, 60_000)
})
