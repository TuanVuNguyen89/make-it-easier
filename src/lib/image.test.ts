import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeImage, encodeImage, sniffFormat, type ImageFormat } from './image'
import { makeBitmap } from './imageOps'

const fixture = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`))

describe('image codec', () => {
  it('giải mã PNG và JPG thật với đúng kích thước và màu', async () => {
    const png = await decodeImage(fixture('image-red.png'))
    expect([png.width, png.height]).toEqual([320, 240])
    expect([...png.data.slice(0, 3)]).toEqual([200, 60, 60]) // góc trên-trái: ngoài khung viền trắng
    const jpg = await decodeImage(fixture('image-wide.png'))
    expect([jpg.width, jpg.height]).toEqual([640, 240])
    const j = await decodeImage(fixture('image-tall.jpg'))
    expect([j.width, j.height]).toEqual([200, 400])
  })

  it('vòng tròn mã hóa → giải mã giữ nguyên điểm ảnh với PNG và TIFF (không mất dữ liệu)', async () => {
    const bm = makeBitmap(8, 6)
    for (let i = 0; i < 48; i++) bm.data.set([i * 5, 255 - i * 5, (i * 37) % 256, 255], i * 4)
    for (const f of ['png', 'tiff'] as ImageFormat[]) {
      const back = await decodeImage(await encodeImage(bm, f))
      expect([back.width, back.height], f).toEqual([8, 6])
      expect([...back.data], f).toEqual([...bm.data])
    }
  })

  it('mỗi định dạng có đúng chữ ký tệp và giải mã lại được (trừ AVIF chỉ kiểm chữ ký)', async () => {
    const bm = await decodeImage(fixture('image-red.png'))
    const sig = { png: 'png', jpg: 'jpg', webp: 'webp', tiff: 'tiff', avif: 'avif' } as const
    for (const f of Object.keys(sig) as ImageFormat[]) {
      const bytes = await encodeImage(bm, f, 80)
      expect(sniffFormat(bytes), f).toBe(sig[f])
      if (f !== 'avif') {
        const back = await decodeImage(bytes)
        expect([back.width, back.height], f).toEqual([320, 240])
      }
    }
  })

  it('JPG dán nền trắng lên vùng trong suốt', async () => {
    const bm = makeBitmap(4, 4) // toàn trong suốt
    const back = await decodeImage(await encodeImage(bm, 'jpg', 95))
    expect(back.data[0]).toBeGreaterThan(245)
    expect(back.data[3]).toBe(255)
  })

  it('chất lượng thấp hơn cho tệp nhỏ hơn (JPG, WebP, AVIF)', async () => {
    const bm = await decodeImage(fixture('image-tall.jpg'))
    for (const f of ['jpg', 'webp', 'avif'] as ImageFormat[]) {
      // thêm nhiễu để nén có việc để làm
      const noisy = { ...bm, data: bm.data.map((v, i) => (i % 4 === 3 ? v : (v + ((i * 2654435761) >>> 24)) & 255)) as unknown as Uint8ClampedArray }
      const hi = await encodeImage(noisy, f, 95)
      const lo = await encodeImage(noisy, f, 20)
      expect(lo.byteLength, f).toBeLessThan(hi.byteLength)
    }
  })

  it('tệp không phải ảnh: invalid-image', async () => {
    await expect(decodeImage(fixture('sample.txt'))).rejects.toMatchObject({ code: 'invalid-image' })
    await expect(decodeImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).rejects.toMatchObject({ code: 'invalid-image' })
  })
})
