import { describe, expect, it } from 'vitest'
import { ctx, numberedPdf, rotations } from '../testUtils'
import { run } from './run'

describe('rotate-pages', () => {
  it('xoay đúng các trang chọn, các trang khác giữ nguyên', async () => {
    const [out] = await run([await numberedPdf(4)], { ranges: '2-3', angle: '90' }, ctx())
    expect(await rotations(out!.data)).toEqual([0, 90, 90, 0])
  })
  it('bỏ trống khoảng = xoay tất cả', async () => {
    const [out] = await run([await numberedPdf(3)], { ranges: '', angle: '180' }, ctx())
    expect(await rotations(out!.data)).toEqual([180, 180, 180])
  })
  it('xoay cộng dồn trên góc sẵn có (270 + 90 = 0)', async () => {
    const [a] = await run([await numberedPdf(1)], { ranges: '', angle: '270' }, ctx())
    const [b] = await run([a!.data], { ranges: '', angle: '90' }, ctx())
    expect(await rotations(b!.data)).toEqual([0])
  })
  it('góc sai bị từ chối', async () => {
    await expect(run([await numberedPdf(1)], { ranges: '', angle: '45' }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})
