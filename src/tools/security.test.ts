import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { ctx, numberedPdf } from './testUtils'
import { run as protect } from './protect/run'
import { run as unlock } from './unlock/run'
import { run as compress } from './compress/run'

const fixture = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`))

async function heavyPdf() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < 20; i++) {
    const p = doc.addPage()
    for (let l = 0; l < 40; l++) p.drawText(`Line ${l} of page ${i}: the quick brown fox jumps over the lazy dog`, { x: 40, y: 800 - l * 17, size: 10, font })
  }
  return doc.save({ useObjectStreams: false })
}

describe('protect + unlock', () => {
  it('file đầu ra đòi mật khẩu; mở khóa đúng mật khẩu thì giữ nguyên số trang', async () => {
    const [prot] = await protect([await numberedPdf(4)], { password: 'bí-mật 123' }, ctx())
    await expect(PDFDocument.load(prot!.data)).rejects.toThrow(/encrypt/i)
    const [open] = await unlock([prot!.data], { password: 'bí-mật 123' }, ctx())
    expect((await PDFDocument.load(open!.data)).getPageCount()).toBe(4)
  })

  it('mở khóa sai mật khẩu hoặc bỏ trống: wrong-password, không có đầu ra', async () => {
    const [prot] = await protect([await numberedPdf(2)], { password: 'đúng' }, ctx())
    await expect(unlock([prot!.data], { password: 'sai' }, ctx())).rejects.toMatchObject({ code: 'wrong-password' })
    await expect(unlock([prot!.data], { password: '' }, ctx())).rejects.toMatchObject({ code: 'wrong-password' })
  })

  it('mở được fixture có mật khẩu "secret" tạo bởi Ghostscript (tương thích trình đọc ngoài)', async () => {
    const [open] = await unlock([fixture('encrypted-secret.pdf')], { password: 'secret' }, ctx())
    expect((await PDFDocument.load(open!.data)).getPageCount()).toBe(1)
  })

  it('đặt mật khẩu cho PDF đã khóa: encrypted; mật khẩu rỗng: invalid-options', async () => {
    await expect(protect([fixture('encrypted-secret.pdf')], { password: 'x' }, ctx())).rejects.toMatchObject({ code: 'encrypted' })
    await expect(protect([await numberedPdf(1)], { password: '' }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })

  it('không phải PDF: invalid-pdf', async () => {
    await expect(unlock([fixture('not-a-pdf.pdf')], { password: 'x' }, ctx())).rejects.toMatchObject({ code: 'invalid-pdf' })
  })
})

describe('compress', () => {
  it('giảm dung lượng, giữ số trang, không đổi nội dung', async () => {
    const src = await heavyPdf()
    const [out] = await compress([src], {}, ctx())
    expect(out!.data.byteLength).toBeLessThan(src.byteLength * 0.8)
    expect((await PDFDocument.load(out!.data)).getPageCount()).toBe(20)
  })

  it('không giảm được: no-reduction, không xuất file', async () => {
    await expect(compress([fixture('sample-1p.pdf')], {}, ctx())).rejects.toMatchObject({ code: 'no-reduction' })
  })

  it('PDF có mật khẩu: encrypted', async () => {
    await expect(compress([fixture('encrypted-secret.pdf')], {}, ctx())).rejects.toMatchObject({ code: 'encrypted' })
  })
})
