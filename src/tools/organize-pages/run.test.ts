import { describe, expect, it } from 'vitest'
import { ctx, numberedPdf, rotations, widths } from '../testUtils'
import { run } from './run'

describe('organize-pages', () => {
  it('sắp xếp lại, xóa và xoay theo danh sách trang', async () => {
    const src = await numberedPdf(5)
    const copy = src.slice()
    const [out] = await run(
      [src],
      { pages: [{ src: 4, rotate: 0 }, { src: 0, rotate: 90 }, { src: 2, rotate: -90 }] },
      ctx(),
    )
    expect(await widths(out!.data)).toEqual([5, 1, 3])
    expect(await rotations(out!.data)).toEqual([0, 90, 270])
    expect(src).toEqual(copy)
  })
  it('cho phép nhân đôi một trang', async () => {
    const [out] = await run([await numberedPdf(2)], { pages: [{ src: 1, rotate: 0 }, { src: 1, rotate: 0 }] }, ctx())
    expect(await widths(out!.data)).toEqual([2, 2])
  })
  it('không cho danh sách rỗng hoặc chỉ số ngoài phạm vi', async () => {
    await expect(run([await numberedPdf(2)], { pages: [] }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(run([await numberedPdf(2)], { pages: [{ src: 2, rotate: 0 }] }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})
