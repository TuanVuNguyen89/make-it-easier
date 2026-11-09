import { describe, expect, it } from 'vitest'
import { ctx, numberedPdf, widths } from '../testUtils'
import { run } from './run'

describe('extract-pages', () => {
  it('trích đúng các trang theo thứ tự nhập, bản gốc không đổi', async () => {
    const src = await numberedPdf(10)
    const copy = src.slice()
    const [out] = await run([src], { ranges: '8, 2-3' }, ctx())
    expect(await widths(out!.data)).toEqual([8, 2, 3])
    expect(src).toEqual(copy)
  })
  it('từ chối khoảng sai', async () => {
    await expect(run([await numberedPdf(5)], { ranges: '6' }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
  it('PDF có mật khẩu: encrypted', async () => {
    const { readFileSync } = await import('node:fs')
    await expect(run([new Uint8Array(readFileSync('tests/fixtures/encrypted-secret.pdf'))], { ranges: '1' }, ctx())).rejects.toMatchObject({ code: 'encrypted' })
  })
})
