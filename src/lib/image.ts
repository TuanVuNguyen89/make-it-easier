import { ToolError } from '@/tools/types'
import { flattenOnWhite, makeBitmap, type Bitmap } from './imageOps'

export type ImageFormat = 'png' | 'jpg' | 'webp' | 'tiff' | 'avif'

export { IMAGE_EXTENSIONS, IMAGE_MIMES } from './imageTypes'

export const MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  tiff: 'image/tiff',
  avif: 'image/avif',
}

/** Giải mã/mã hóa bằng canvas. Mặc định là trình duyệt; test Node gắn backend khác. */
export interface ImageBackend {
  decode(bytes: Uint8Array): Promise<Bitmap>
  encode(bm: Bitmap, format: 'png' | 'jpg' | 'webp', quality: number): Promise<Uint8Array>
}

const browserBackend: ImageBackend = {
  async decode(bytes) {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return { width: img.width, height: img.height, data: img.data }
  },
  async encode(bm, format, quality) {
    const canvas = new OffscreenCanvas(bm.width, bm.height)
    canvas.getContext('2d')!.putImageData(new ImageData(bm.data as Uint8ClampedArray<ArrayBuffer>, bm.width, bm.height), 0, 0)
    const blob = await canvas.convertToBlob({ type: MIME[format], quality: quality / 100 })
    return new Uint8Array(await blob.arrayBuffer())
  },
}

let backend: ImageBackend = browserBackend
export function setImageBackend(b: ImageBackend): void {
  backend = b
}

const isTiff = (b: Uint8Array) =>
  (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)

export function sniffFormat(b: Uint8Array): ImageFormat | 'gif' | 'bmp' | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'webp'
  if (isTiff(b)) return 'tiff'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif'
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp'
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'avif'
  return null
}

export async function decodeImage(bytes: Uint8Array): Promise<Bitmap> {
  try {
    if (isTiff(bytes)) {
      const UTIF = (await import('utif2')).default
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      const ifds = UTIF.decode(buf)
      const first = ifds[0]
      if (!first) throw new Error('empty tiff')
      UTIF.decodeImage(buf, first)
      const bm = makeBitmap(first.width, first.height)
      bm.data.set(UTIF.toRGBA8(first))
      return bm
    }
    if (!sniffFormat(bytes)) throw new Error('unknown format')
    return await backend.decode(bytes)
  } catch (e) {
    if (e instanceof ToolError) throw e
    throw new ToolError('invalid-image', 'Image could not be decoded')
  }
}

/** quality 1..100: áp dụng cho JPG, WebP, AVIF; PNG và TIFF không mất dữ liệu. */
export async function encodeImage(bm: Bitmap, format: ImageFormat, quality = 90): Promise<Uint8Array> {
  switch (format) {
    case 'png':
    case 'webp':
      return backend.encode(bm, format, quality)
    case 'jpg':
      return backend.encode(flattenOnWhite(bm), 'jpg', quality) // JPEG không có kênh alpha
    case 'tiff': {
      const UTIF = (await import('utif2')).default
      const out = UTIF.encodeImage(new Uint8Array(bm.data.buffer, bm.data.byteOffset, bm.data.byteLength), bm.width, bm.height)
      return new Uint8Array(out)
    }
    case 'avif':
      return (await import('./avif')).encodeAvif(bm, quality)
  }
}

export function baseName(name: string | undefined, fallback = 'image'): string {
  if (!name) return fallback
  const i = name.lastIndexOf('.')
  return (i > 0 ? name.slice(0, i) : name) || fallback
}
