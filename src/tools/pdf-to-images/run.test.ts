import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { ctx, numberedPdf } from '../testUtils'
import { run } from './run'

const fixture = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`))
const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
const isJpg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8

async function stats(bytes: Uint8Array) {
  const img = await loadImage(Buffer.from(bytes))
  const c = createCanvas(img.width, img.height)
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  const px = g.getImageData(0, 0, img.width, img.height).data
  let dark = 0
  for (let i = 0; i < px.length; i += 4) if (px[i]! < 100) dark++
  return { width: img.width, height: img.height, dark }
}

describe('pdf-to-images', () => {
  it('mỗi trang một ảnh PNG, đúng thứ tự tên và đúng kích thước theo dpi', async () => {
    const out = await run([fixture('sample-10p.pdf')], { format: 'png', dpi: '72' }, ctx())
    expect(out).toHaveLength(10)
    expect(out.map((o) => o.name).slice(0, 3)).toEqual(['page-1.png', 'page-2.png', 'page-3.png'])
    expect(out.every((o) => o.mime === 'image/png' && isPng(o.data))).toBe(true)
    const s = await stats(out[0]!.data)
    expect(s.width).toBe(595)
    expect(s.height).toBe(842)
  })

  it('trang có chữ thì ảnh có điểm tối (không phải ảnh trắng trơn)', async () => {
    const [p1] = await run([fixture('sample-1p.pdf')], { format: 'png', dpi: '150' }, ctx())
    const s = await stats(p1!.data)
    expect(s.width).toBe(Math.ceil((595 * 150) / 72))
    expect(s.dark).toBeGreaterThan(200)
  })

  it('xuất JPG với nền trắng', async () => {
    const [p] = await run([fixture('sample-1p.pdf')], { format: 'jpg', dpi: '72' }, ctx())
    expect(isJpg(p!.data)).toBe(true)
    expect(p!.mime).toBe('image/jpeg')
    const s = await stats(p!.data)
    expect(s.dark).toBeGreaterThan(50)
    expect(s.dark).toBeLessThan(s.width * s.height * 0.2)
  })

  it('báo tiến trình theo từng trang', async () => {
    const seen: number[] = []
    await run([await numberedPdf(3)], { format: 'png', dpi: '72' }, { progress: (f) => seen.push(f), signal: new AbortController().signal })
    expect(seen).toEqual([1 / 3, 2 / 3, 1])
  })

  it('PDF có mật khẩu: encrypted; hỏng: invalid-pdf; hủy: aborted; tùy chọn sai: invalid-options', async () => {
    await expect(run([fixture('encrypted-secret.pdf')], { format: 'png', dpi: '72' }, ctx())).rejects.toMatchObject({ code: 'encrypted' })
    await expect(run([fixture('corrupt.pdf')], { format: 'png', dpi: '72' }, ctx())).rejects.toMatchObject({ code: 'invalid-pdf' })
    const ac = new AbortController()
    ac.abort()
    await expect(run([fixture('sample-1p.pdf')], { format: 'png', dpi: '72' }, { progress: () => {}, signal: ac.signal })).rejects.toMatchObject({ code: 'aborted' })
    await expect(run([fixture('sample-1p.pdf')], { format: 'png', dpi: '999' }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})
