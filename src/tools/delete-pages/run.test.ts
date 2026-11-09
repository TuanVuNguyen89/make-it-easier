import { describe, expect, it } from 'vitest'
import { ctx, numberedPdf, widths } from '../testUtils'
import { run } from './run'

describe('delete-pages', () => {
  it('xóa các trang chọn, giữ thứ tự còn lại', async () => {
    const [out] = await run([await numberedPdf(6)], { ranges: '2, 4-5' }, ctx())
    expect(await widths(out!.data)).toEqual([1, 3, 6])
  })
  it('không cho xóa hết mọi trang', async () => {
    await expect(run([await numberedPdf(3)], { ranges: '1-3' }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
  it('trang trùng lặp chỉ tính một lần', async () => {
    const [out] = await run([await numberedPdf(4)], { ranges: '2, 2, 2-3' }, ctx())
    expect(await widths(out!.data)).toEqual([1, 4])
  })
})
