import { describe, expect, it } from 'vitest'
import { ctx, numberedPdf, widths } from '../testUtils'
import { run } from './run'

describe('split', () => {
  it('"1-3, 4-10" ra 2 file đúng số trang và đúng trang', async () => {
    const out = await run([await numberedPdf(10)], { mode: 'ranges', ranges: '1-3, 4-10' }, ctx())
    expect(out).toHaveLength(2)
    expect(await widths(out[0]!.data)).toEqual([1, 2, 3])
    expect(await widths(out[1]!.data)).toEqual([4, 5, 6, 7, 8, 9, 10])
  })
  it('mỗi trang một file', async () => {
    const out = await run([await numberedPdf(3)], { mode: 'each', ranges: '' }, ctx())
    expect(out.map((o) => o.name)).toEqual(['part-1.pdf', 'part-2.pdf', 'part-3.pdf'])
  })
  it('khoảng không hợp lệ: invalid-options, không có đầu ra', async () => {
    await expect(run([await numberedPdf(3)], { mode: 'ranges', ranges: '1-9' }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})
