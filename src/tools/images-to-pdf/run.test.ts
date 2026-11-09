import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { ctx } from '../testUtils'
import { run } from './run'

const fixture = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`))
const sizes = async (b: Uint8Array) => (await PDFDocument.load(b)).getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())])

describe('images-to-pdf', () => {
  it('3 ảnh thành PDF 3 trang theo đúng thứ tự (PNG và JPG trộn lẫn)', async () => {
    const inputs = [fixture('image-wide.png'), fixture('image-tall.jpg'), fixture('image-red.png')]
    const [out] = await run(inputs, { pageSize: 'fit' }, ctx())
    // 640x240, 200x400, 320x240 px nhân 0.75
    expect(await sizes(out!.data)).toEqual([[480, 180], [150, 300], [240, 180]])
  })

  it('đảo thứ tự đầu vào thì đảo thứ tự trang', async () => {
    const [out] = await run([fixture('image-tall.jpg'), fixture('image-wide.png')], { pageSize: 'fit' }, ctx())
    expect(await sizes(out!.data)).toEqual([[150, 300], [480, 180]])
  })

  it('khổ A4: ảnh ngang tạo trang A4 ngang, ảnh dọc tạo trang dọc', async () => {
    const [out] = await run([fixture('image-wide.png'), fixture('image-tall.jpg')], { pageSize: 'a4' }, ctx())
    expect(await sizes(out!.data)).toEqual([[842, 595], [595, 842]])
  })

  it('tệp không phải ảnh: invalid-image và không có đầu ra', async () => {
    await expect(run([fixture('image-red.png'), fixture('sample.txt')], { pageSize: 'fit' }, ctx())).rejects.toMatchObject({ code: 'invalid-image' })
  })

  it('tùy chọn khổ giấy sai và hủy giữa chừng', async () => {
    await expect(run([fixture('image-red.png')], { pageSize: 'a3' as never }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    const ac = new AbortController()
    ac.abort()
    await expect(run([fixture('image-red.png')], { pageSize: 'fit' }, { progress: () => {}, signal: ac.signal })).rejects.toMatchObject({ code: 'aborted' })
  })
})
