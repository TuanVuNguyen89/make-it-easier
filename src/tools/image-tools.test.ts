import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeImage, encodeImage, sniffFormat, type ImageFormat } from '@/lib/image'
import { makeBitmap, type Bitmap } from '@/lib/imageOps'
import { ctx } from './testUtils'
import { run as resize } from './image-resize/run'
import { run as rotate } from './image-rotate/run'
import { run as crop } from './image-crop/run'
import { run as compress } from './image-compress/run'
import { run as convert } from './image-convert/run'
import { run as enhance } from './image-enhance/run'
import { run as removeBg } from './image-remove-bg/run'
import { run as erase } from './image-erase/run'
import { run as toPng } from './image-to-png/run'
import { run as toJpg } from './image-to-jpg/run'
import { run as toWebp } from './image-to-webp/run'
import { run as toTiff } from './image-to-tiff/run'
import { run as toAvif } from './image-to-avif/run'

const fixture = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`))
const dims = async (b: Uint8Array) => {
  const d = await decodeImage(b)
  return [d.width, d.height]
}
const make = (w: number, h: number, f: (x: number, y: number) => number[]): Bitmap => {
  const b = makeBitmap(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.data.set(f(x, y), (y * w + x) * 4)
  return b
}
const noisy = (w: number, h: number) => make(w, h, (x, y) => [(x * 7 + (x * y) % 97) & 255, (y * 5 + ((x ^ y) * 13)) & 255, ((x + y) * 3 + ((x * y) % 251)) & 255, 255])

describe('image-resize', () => {
  it('50% đúng kích thước, giữ định dạng và đặt tên theo tệp gốc', async () => {
    const [out] = await resize([fixture('image-wide.png')], { mode: 'percent', percent: 50, width: 0, height: 0, keepAspect: true }, ctx(['image-wide.png']))
    expect(out!.name).toBe('image-wide-resized.png')
    expect(out!.mime).toBe('image/png')
    expect(await dims(out!.data)).toEqual([320, 120])
  })
  it('JPG vào thì JPG ra', async () => {
    const [out] = await resize([fixture('image-tall.jpg')], { mode: 'percent', percent: 25, width: 0, height: 0, keepAspect: true }, ctx(['t.jpg']))
    expect(sniffFormat(out!.data)).toBe('jpg')
    expect(out!.name).toBe('t-resized.jpg')
    expect(await dims(out!.data)).toEqual([50, 100])
  })
  it('theo pixel giữ tỉ lệ (chỉ chiều rộng, chỉ chiều cao) và không giữ tỉ lệ', async () => {
    const run = (o: object) => resize([fixture('image-wide.png')], { mode: 'pixels', percent: 0, width: 0, height: 0, keepAspect: true, ...o }, ctx())
    expect(await dims((await run({ width: 100 }))[0]!.data)).toEqual([100, 38])
    expect(await dims((await run({ height: 60 }))[0]!.data)).toEqual([160, 60])
    expect(await dims((await run({ width: 50, height: 50, keepAspect: false }))[0]!.data)).toEqual([50, 50])
  })
  it('phóng to 200%', async () => {
    const [out] = await resize([fixture('image-red.png')], { mode: 'percent', percent: 200, width: 0, height: 0, keepAspect: true }, ctx())
    expect(await dims(out!.data)).toEqual([640, 480])
  })
  it('nhiều ảnh một lần, thứ tự giữ nguyên', async () => {
    const out = await resize([fixture('image-wide.png'), fixture('image-tall.jpg')], { mode: 'percent', percent: 50, width: 0, height: 0, keepAspect: true }, ctx(['a.png', 'b.jpg']))
    expect(out.map((o) => o.name)).toEqual(['a-resized.png', 'b-resized.jpg'])
  })
  it('đầu vào TIFF được xử lý và ra TIFF', async () => {
    const tiff = await encodeImage(noisy(40, 20), 'tiff')
    const [out] = await resize([tiff], { mode: 'percent', percent: 50, width: 0, height: 0, keepAspect: true }, ctx(['x.tif']))
    expect(sniffFormat(out!.data)).toBe('tiff')
    expect(await dims(out!.data)).toEqual([20, 10])
  })
  it('tùy chọn sai bị từ chối; hủy dừng ngay; tệp không phải ảnh: invalid-image', async () => {
    const bad = (o: object) => resize([fixture('image-red.png')], { mode: 'percent', percent: 50, width: 0, height: 0, keepAspect: true, ...o }, ctx())
    await expect(bad({ percent: 0 })).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(bad({ mode: 'pixels' })).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(bad({ mode: 'pixels', keepAspect: false, width: 10, height: 0 })).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(resize([fixture('sample.txt')], { mode: 'percent', percent: 50, width: 0, height: 0, keepAspect: true }, ctx())).rejects.toMatchObject({ code: 'invalid-image' })
    const ac = new AbortController()
    ac.abort()
    await expect(resize([fixture('image-red.png')], { mode: 'percent', percent: 50, width: 0, height: 0, keepAspect: true }, { progress: () => {}, signal: ac.signal })).rejects.toMatchObject({ code: 'aborted' })
  })
})

describe('image-rotate', () => {
  it('90° đổi chiều rộng và cao; lật không đổi kích thước', async () => {
    const [r] = await rotate([fixture('image-wide.png')], { angle: '90', flipH: false, flipV: false }, ctx(['w.png']))
    expect(await dims(r!.data)).toEqual([240, 640])
    expect(r!.name).toBe('w-rotated.png')
    const [f] = await rotate([fixture('image-wide.png')], { angle: '0', flipH: true, flipV: false }, ctx())
    expect(await dims(f!.data)).toEqual([640, 240])
  })
  it('xoay thật sự dịch chuyển điểm ảnh: góc trên-trái ra góc trên-phải', async () => {
    const png = await encodeImage(make(4, 2, (x, y) => (x === 0 && y === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255])), 'png')
    const [out] = await rotate([png], { angle: '90', flipH: false, flipV: false }, ctx())
    const d = await decodeImage(out!.data)
    expect([d.width, d.height]).toEqual([2, 4])
    expect([...d.data.slice((0 * 2 + 1) * 4, (0 * 2 + 1) * 4 + 3)]).toEqual([255, 0, 0])
  })
  it('không làm gì và góc sai bị từ chối', async () => {
    await expect(rotate([fixture('image-red.png')], { angle: '0', flipH: false, flipV: false }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(rotate([fixture('image-red.png')], { angle: '45', flipH: false, flipV: false }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})

describe('image-crop', () => {
  it('cắt đúng vùng và đúng nội dung', async () => {
    const src = await encodeImage(make(50, 40, (x, y) => [x * 4, y * 5, 0, 255]), 'png')
    const [out] = await crop([src], { x: 10, y: 20, width: 15, height: 10 }, ctx(['p.png']))
    const d = await decodeImage(out!.data)
    expect([d.width, d.height]).toEqual([15, 10])
    expect([...d.data.slice(0, 2)]).toEqual([40, 100])
    expect(out!.name).toBe('p-cropped.png')
  })
  it('vùng ngoài ảnh bị từ chối', async () => {
    await expect(crop([fixture('image-red.png')], { x: 300, y: 0, width: 100, height: 10 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(crop([fixture('image-red.png')], { x: 0, y: 0, width: 0, height: 10 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})

describe('image-compress', () => {
  it('JPG chất lượng thấp ra tệp nhỏ hơn và vẫn giữ kích thước', async () => {
    const big = await encodeImage(noisy(200, 150), 'jpg', 98)
    const [out] = await compress([big], { quality: 30 }, ctx(['n.jpg']))
    expect(out!.data.byteLength).toBeLessThan(big.byteLength)
    expect(out!.name).toBe('n-compressed.jpg')
    expect(await dims(out!.data)).toEqual([200, 150])
  })
  it('WebP và AVIF cũng nhỏ hơn', async () => {
    for (const f of ['webp', 'avif'] as ImageFormat[]) {
      const big = await encodeImage(noisy(160, 120), f, 98)
      const [out] = await compress([big], { quality: 20 }, ctx([`n.${f}`]))
      expect(out!.data.byteLength, f).toBeLessThan(big.byteLength)
      expect(sniffFormat(out!.data), f).toBe(f)
    }
  })
  it('PNG giảm số màu nên nhỏ hơn, vẫn là PNG đúng kích thước', async () => {
    const png = await encodeImage(noisy(120, 90), 'png')
    const [out] = await compress([png], { quality: 40 }, ctx(['n.png']))
    expect(out!.data.byteLength).toBeLessThan(png.byteLength)
    expect(sniffFormat(out!.data)).toBe('png')
    expect(await dims(out!.data)).toEqual([120, 90])
  })
  it('ảnh đã nhỏ nhất: no-reduction và không có đầu ra', async () => {
    const tiny = await encodeImage(make(1, 1, () => [10, 20, 30, 255]), 'png')
    await expect(compress([tiny], { quality: 50 }, ctx())).rejects.toMatchObject({ code: 'no-reduction' })
  })
  it('nhiều ảnh: chỉ xuất ảnh nào thật sự nhỏ đi', async () => {
    const big = await encodeImage(noisy(200, 150), 'jpg', 98)
    const tiny = await encodeImage(make(1, 1, () => [10, 20, 30, 255]), 'png')
    const out = await compress([big, tiny], { quality: 30 }, ctx(['a.jpg', 'b.png']))
    expect(out.map((o) => o.name)).toEqual(['a-compressed.jpg'])
  })
  it('chất lượng ngoài khoảng bị từ chối', async () => {
    await expect(compress([fixture('image-red.png')], { quality: 0 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})

describe('chuyển định dạng', () => {
  const cases: [string, typeof toPng, ImageFormat][] = [
    ['image-to-png', toPng, 'png'], ['image-to-jpg', toJpg, 'jpg'], ['image-to-webp', toWebp, 'webp'], ['image-to-tiff', toTiff, 'tiff'], ['image-to-avif', toAvif, 'avif'],
  ]
  for (const [id, run, fmt] of cases) {
    it(`${id}: đúng định dạng, đúng tên, đúng kích thước`, async () => {
      const src = fmt === 'png' ? 'image-tall.jpg' : 'image-wide.png'
      const [out] = await run([fixture(src)], {}, ctx(['pic.' + src.split('.')[1]]))
      expect(sniffFormat(out!.data)).toBe(fmt)
      expect(out!.name).toBe(`pic.${fmt}`)
      if (fmt !== 'avif') expect(await dims(out!.data)).toEqual(fmt === 'png' ? [200, 400] : [640, 240])
    })
  }
  it('image-convert chọn định dạng và chất lượng tùy ý, nhiều ảnh một lần', async () => {
    const out = await convert([fixture('image-wide.png'), fixture('image-tall.jpg')], { format: 'webp', quality: 50 }, ctx(['a.png', 'b.jpg']))
    expect(out.map((o) => o.name)).toEqual(['a.webp', 'b.webp'])
    expect(out.every((o) => sniffFormat(o.data) === 'webp')).toBe(true)
  })
  it('PNG trong suốt sang JPG dán nền trắng; sang WebP giữ trong suốt', async () => {
    const png = await encodeImage(make(4, 4, () => [0, 0, 0, 0]), 'png')
    const [jpg] = await toJpg([png], {}, ctx())
    expect((await decodeImage(jpg!.data)).data[0]).toBeGreaterThan(245)
    const [webp] = await toWebp([png], { quality: 90 }, ctx())
    expect((await decodeImage(webp!.data)).data[3]).toBe(0)
  })
  it('định dạng hoặc chất lượng sai bị từ chối; không phải ảnh: invalid-image', async () => {
    await expect(convert([fixture('image-red.png')], { format: 'gif' as never }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(toJpg([fixture('image-red.png')], { quality: 500 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(toPng([fixture('sample.txt')], {}, ctx())).rejects.toMatchObject({ code: 'invalid-image' })
  })
})

describe('image-enhance', () => {
  it('phóng to theo hệ số và làm nét', async () => {
    const [out] = await enhance([fixture('image-red.png')], { scale: '2', sharpen: 40, levels: false }, ctx(['r.png']))
    expect(await dims(out!.data)).toEqual([640, 480])
    expect(out!.name).toBe('r-enhanced.png')
  })
  it('hệ số 1 chỉ làm nét/cân bằng, không đổi kích thước', async () => {
    const [out] = await enhance([fixture('image-red.png')], { scale: '1', sharpen: 0, levels: true }, ctx())
    expect(await dims(out!.data)).toEqual([320, 240])
  })
  it('tùy chọn sai bị từ chối', async () => {
    await expect(enhance([fixture('image-red.png')], { scale: '8', sharpen: 10, levels: false }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})

describe('image-remove-bg', () => {
  it('nền trắng thành trong suốt, chủ thể giữ nguyên, luôn ra PNG', async () => {
    const png = await encodeImage(make(30, 30, (x, y) => (x >= 10 && x < 20 && y >= 10 && y < 20 ? [200, 30, 30, 255] : [255, 255, 255, 255])), 'png')
    const [out] = await removeBg([png], { tolerance: 20, feather: true }, ctx(['logo.jpg']))
    expect(out!.name).toBe('logo-no-bg.png')
    expect(sniffFormat(out!.data)).toBe('png')
    const d = await decodeImage(out!.data)
    expect(d.data[3]).toBe(0)
    const c = (15 * 30 + 15) * 4
    expect([...d.data.slice(c, c + 4)]).toEqual([200, 30, 30, 255])
  })
  it('dung sai ngoài khoảng bị từ chối', async () => {
    await expect(removeBg([fixture('image-red.png')], { tolerance: 0, feather: false }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})

describe('image-erase', () => {
  it('vùng tô được vá bằng màu nền, ngoài vùng giữ nguyên', async () => {
    const w = 40, h = 30
    const png = await encodeImage(make(w, h, (x, y) => (x >= 15 && x < 25 && y >= 10 && y < 20 ? [255, 0, 0, 255] : [30, 90, 160, 255])), 'png')
    const mask = new Uint8Array(w * h)
    for (let y = 10; y < 20; y++) for (let x = 15; x < 25; x++) mask[y * w + x] = 255
    const [out] = await erase([png], { mask, maskWidth: w, maskHeight: h }, ctx(['obj.png']))
    expect(out!.name).toBe('obj-erased.png')
    const d = await decodeImage(out!.data)
    const at = (x: number, y: number) => [...d.data.slice((y * w + x) * 4, (y * w + x) * 4 + 3)]
    for (const [x, y] of [[20, 15], [15, 10], [24, 19]] as const) {
      const [r, g, b] = at(x, y)
      expect(Math.abs(r! - 30)).toBeLessThan(8)
      expect(Math.abs(g! - 90)).toBeLessThan(8)
      expect(Math.abs(b! - 160)).toBeLessThan(8)
    }
    expect(at(0, 0)).toEqual([30, 90, 160])
  })
  it('thiếu mask, mask rỗng hoặc sai kích thước bị từ chối', async () => {
    const png = fixture('image-red.png')
    await expect(erase([png], {} as never, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(erase([png], { mask: new Uint8Array(10), maskWidth: 320, maskHeight: 240 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(erase([png], { mask: new Uint8Array(100).fill(255), maskWidth: 10, maskHeight: 10 }, ctx())).rejects.toMatchObject({ code: 'invalid-options' })
  })
})
