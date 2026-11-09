import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { runQpdf } from '@/lib/qpdf'
import { ctx, pageTexts } from '../testUtils'
import { run } from './run'

const fixture = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`))
const check = async (b: Uint8Array) => (await runQpdf(['--check'], b, { noOutput: true })).code

describe('repair', () => {
  for (const name of ['damaged-startxref.pdf', 'damaged-offsets.pdf', 'damaged-notrailer.pdf']) {
    it(`${name}: trình đọc nghiêm ngặt (qpdf) không mở được trước khi sửa, mở được sau khi sửa, giữ đủ 10 trang và chữ`, async () => {
      const damaged = fixture(name)
      expect(await check(damaged), 'trước khi sửa').toBe(2)
      const [out] = await run([damaged], {}, ctx())
      expect(out!.name).toBe('repaired.pdf')
      expect(await check(out!.data), 'sau khi sửa').toBe(0)
      expect((await PDFDocument.load(out!.data)).getPageCount()).toBe(10)
      const texts = await pageTexts(out!.data)
      expect(texts.map((t) => t.map((x) => x.str).join(''))).toEqual(Array.from({ length: 10 }, (_, i) => `Sample - page ${i + 1}/10`))
    })
  }

  it('tệp bình thường vẫn xử lý được và giữ nguyên số trang', async () => {
    const [out] = await run([fixture('sample-10p.pdf')], {}, ctx())
    expect((await PDFDocument.load(out!.data)).getPageCount()).toBe(10)
    expect(await check(out!.data)).toBe(0)
  })

  it('PDF cắt cụt mất hết nội dung hoặc không phải PDF: invalid-pdf, không có đầu ra', async () => {
    await expect(run([fixture('corrupt.pdf')], {}, ctx())).rejects.toMatchObject({ code: 'invalid-pdf' })
    await expect(run([fixture('not-a-pdf.pdf')], {}, ctx())).rejects.toMatchObject({ code: 'invalid-pdf' })
  })

  it('PDF có mật khẩu: encrypted; hủy: aborted', async () => {
    await expect(run([fixture('encrypted-secret.pdf')], {}, ctx())).rejects.toMatchObject({ code: 'encrypted' })
    const ac = new AbortController()
    ac.abort()
    await expect(run([fixture('sample-1p.pdf')], {}, { progress: () => {}, signal: ac.signal })).rejects.toMatchObject({ code: 'aborted' })
  })
})
