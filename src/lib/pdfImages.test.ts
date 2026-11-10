// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFHexString, PDFName, PDFNumber } from 'pdf-lib'
import { unzlibSync } from 'fflate'
import { encodePng, pageImages, type ExtractedImage } from './pdfImages'

/** Giải PNG do `encodePng` tạo (bộ lọc dòng 0) về điểm ảnh thô. */
function decodePng(png: Uint8Array): { w: number; h: number; channels: number; pixels: Uint8Array } {
  const v = new DataView(png.buffer, png.byteOffset)
  const w = v.getUint32(16)
  const h = v.getUint32(20)
  const channels = png[25] === 0 ? 1 : png[25] === 2 ? 3 : 4
  const idat: Uint8Array[] = []
  for (let i = 8; i < png.length; ) {
    const len = v.getUint32(i)
    const type = String.fromCharCode(...png.slice(i + 4, i + 8))
    if (type === 'IDAT') idat.push(png.slice(i + 8, i + 8 + len))
    i += 12 + len
  }
  const raw = unzlibSync(idat.reduce((a, b) => Uint8Array.from([...a, ...b]), new Uint8Array(0)))
  const stride = w * channels
  const pixels = new Uint8Array(stride * h)
  for (let y = 0; y < h; y++) pixels.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride)
  return { w, h, channels, pixels }
}

async function extractFrom(draw: (d: PDFDocument) => Promise<void>) {
  const d = await PDFDocument.create()
  await draw(d)
  const re = await PDFDocument.load(await d.save())
  const cache = new Map<string, ExtractedImage | null>()
  const imgs = pageImages(re, 0, cache)
  const xo = re.getPage(0).node.Resources()!.lookup(PDFName.of('XObject')) as unknown as { keys(): PDFName[] }
  return xo.keys().map((k) => ({ name: k.decodeText(), is: imgs.isImage(k.decodeText()), img: imgs.get(k.decodeText()) }))
}

const PDFHexStringOf = (b: Uint8Array) => PDFHexString.of([...b].map((x) => x.toString(16).padStart(2, '0')).join(''))

describe('encodePng', () => {
  it('ghi PNG hợp lệ: chữ ký, kích thước, kiểu màu, điểm ảnh đọc lại đúng', () => {
    const px = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 10, 20, 30, 40])
    const png = encodePng(px, 2, 2, 4)
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const out = decodePng(png)
    expect(out).toMatchObject({ w: 2, h: 2, channels: 4 })
    expect([...out.pixels]).toEqual([...px])
  })
})

describe('pageImages: lấy ảnh nền từ XObject', () => {
  it('ảnh RGBA có độ trong suốt (SMask) → PNG RGBA đúng từng điểm', async () => {
    const rgba = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 10, 20, 30, 40, 200, 100, 50, 255, 1, 2, 3, 4])
    const [r] = await extractFrom(async (d) => {
      const img = await d.embedPng(encodePng(rgba, 3, 2, 4))
      d.addPage([100, 100]).drawImage(img, { x: 0, y: 0, width: 30, height: 20 })
    })
    expect(r!.is).toBe(true)
    expect(r!.img!.ext).toBe('png')
    const out = decodePng(r!.img!.data)
    expect(out).toMatchObject({ w: 3, h: 2, channels: 4 })
    expect([...out.pixels]).toEqual([...rgba])
  })

  /** Thêm một XObject ảnh tự dựng vào trang (để thử các không gian màu mà pdf-lib không tạo ra). */
  const raw = async (dict: Record<string, unknown>, data: Uint8Array, filter: 'flate' | 'dct' | 'none' = 'flate') => {
    const [r] = await extractFrom(async (d) => {
      const page = d.addPage([100, 100])
      const full = { Type: 'XObject', Subtype: 'Image', ...dict, ...(filter === 'dct' ? { Filter: 'DCTDecode' } : {}) }
      const stream = filter === 'flate' ? d.context.flateStream(data, full) : d.context.stream(data, full)
      page.node.Resources()!.set(PDFName.of('XObject'), d.context.obj({ Im0: d.context.register(stream) }))
    })
    return r!
  }

  it('ảnh xám 8 bit, xám 1 bit, chỉ mục 4 bit (bảng màu) và CMYK đều ra PNG đúng màu', async () => {
    const g = await raw({ Width: 2, Height: 2, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }, Uint8Array.from([0, 64, 128, 255]))
    expect(decodePng(g.img!.data)).toMatchObject({ channels: 1, pixels: Uint8Array.from([0, 64, 128, 255]) })

    // 1 bit: hàng 1 = 10, hàng 2 = 01 (mỗi hàng đệm đủ byte)
    const bit = await raw({ Width: 2, Height: 2, ColorSpace: 'DeviceGray', BitsPerComponent: 1 }, Uint8Array.from([0b10000000, 0b01000000]))
    expect([...decodePng(bit.img!.data).pixels]).toEqual([255, 0, 0, 255])

    // chỉ mục 4 bit: bảng màu 3 mục (đỏ, xanh lá, xanh dương); điểm ảnh 0,1 / 2,0
    const pal = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255])
    const idx = await raw({ Width: 2, Height: 2, BitsPerComponent: 4, ColorSpace: [PDFName.of('Indexed'), PDFName.of('DeviceRGB'), PDFNumber.of(2), PDFHexStringOf(pal)] }, Uint8Array.from([0x01, 0x20]))
    expect([...decodePng(idx.img!.data).pixels]).toEqual([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0])

    // CMYK: (0,0,0,0)=trắng, (1,0,0,0)=cyan, (0,0,0,1)=đen, (0,1,1,0)=đỏ
    const cmyk = await raw({ Width: 2, Height: 2, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8 }, Uint8Array.from([0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 0, 255, 255, 0]))
    expect([...decodePng(cmyk.img!.data).pixels]).toEqual([255, 255, 255, 0, 255, 255, 0, 0, 0, 255, 0, 0])
  })

  it('JPEG RGB giữ nguyên byte; JPEG CMYK, mặt nạ ảnh và không gian màu lạ → null (không xuất ảnh sai)', async () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9])
    const ok = await raw({ Width: 1, Height: 1, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }, jpeg, 'dct')
    expect(ok.img!.ext).toBe('jpeg')
    expect([...ok.img!.data]).toEqual([...jpeg])
    expect((await raw({ Width: 1, Height: 1, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8 }, jpeg, 'dct')).img).toBeNull()
    expect((await raw({ Width: 8, Height: 1, ImageMask: true, BitsPerComponent: 1, ColorSpace: 'DeviceGray' }, Uint8Array.from([0xaa]))).img).toBeNull()
    expect((await raw({ Width: 1, Height: 1, ColorSpace: [PDFName.of('Lab'), new Map()] as never, BitsPerComponent: 8 }, Uint8Array.from([1, 2, 3]))).img).toBeNull()
  })
})
