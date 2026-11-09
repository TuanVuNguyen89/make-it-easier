import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { ctx, pageTexts } from '../testUtils'
import { run } from './run'

const bytes = (s: string) => new TextEncoder().encode(s)
const all = async (b: Uint8Array) => (await pageTexts(b)).map((p) => p.map((i) => i.str).join('\n'))

describe('text-to-pdf', () => {
  it('giữ nguyên tiếng Việt có dấu và thứ tự dòng', async () => {
    const [out] = await run([new Uint8Array(readFileSync('tests/fixtures/vietnamese.txt'))], { size: 12 }, ctx())
    const text = (await all(out!.data))[0]!
    expect(text).toContain('Tiếng Việt có dấu: Ặ ẩ ữ Đ đ')
    expect(text.indexOf('Dòng thứ hai')).toBeGreaterThan(text.indexOf('Tiếng Việt'))
    expect(text).toContain('Thụt đầu dòng')
  })

  it('tự sang trang khi văn bản dài', async () => {
    const long = Array.from({ length: 200 }, (_, i) => `Dòng số ${i + 1}`).join('\n')
    const [out] = await run([bytes(long)], { size: 12 }, ctx())
    const doc = await PDFDocument.load(out!.data)
    expect(doc.getPageCount()).toBeGreaterThan(3)
    const pages = await all(out!.data)
    expect(pages[0]).toContain('Dòng số 1')
    expect(pages.at(-1)).toContain('Dòng số 200')
  })

  it('tự xuống dòng khi dòng quá dài, không mất chữ', async () => {
    const words = Array.from({ length: 60 }, (_, i) => `từ${i}`).join(' ')
    const [out] = await run([bytes(words)], { size: 12 }, ctx())
    const items = (await pageTexts(out!.data))[0]!
    expect(items.length).toBeGreaterThan(1)
    const joined = items.map((i) => i.str).join(' ')
    for (let i = 0; i < 60; i++) expect(joined).toContain(`từ${i}`)
    expect(Math.max(...items.map((i) => i.x))).toBeLessThan(595)
  })

  it('từ dài không có khoảng trắng bị ngắt thay vì tràn lề', async () => {
    const [out] = await run([bytes('A'.repeat(300))], { size: 12 }, ctx())
    const items = (await pageTexts(out!.data))[0]!
    expect(items.length).toBeGreaterThan(1)
    expect(items.map((i) => i.str).join('')).toBe('A'.repeat(300))
  })

  it('xử lý BOM, CRLF và tab', async () => {
    const [out] = await run([bytes('\uFEFFmột\r\nhai\tba')], { size: 12 }, ctx())
    const text = (await all(out!.data))[0]!
    expect(text).toContain('một')
    expect(text).toContain('hai')
    expect(text).not.toContain('\uFEFF')
  })

  it('tệp rỗng hoặc cỡ chữ sai bị từ chối', async () => {
    await expect(run([bytes('  \n ')], { size: 12 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(run([bytes('x')], { size: 4 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})
