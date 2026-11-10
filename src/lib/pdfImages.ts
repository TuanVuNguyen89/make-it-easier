import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, PDFHexString, decodePDFRawStream, type PDFDocument, type PDFObject } from 'pdf-lib'
import { zlibSync } from 'fflate'

export interface ExtractedImage {
  data: Uint8Array
  ext: 'png' | 'jpeg'
  /** Kích thước điểm ảnh gốc. */
  width: number
  height: number
}

const MAX_PIXELS = 40_000_000

// ---- PNG tối thiểu (không nén theo bộ lọc dòng; zlib của fflate) ----
let crcTable: Uint32Array | null = null
function crc32(b: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const v = new DataView(out.buffer)
  v.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}
/** Mã hóa PNG từ điểm ảnh 8 bit: channels 1 (xám), 3 (RGB) hoặc 4 (RGBA). */
export function encodePng(pixels: Uint8Array, width: number, height: number, channels: 1 | 3 | 4): Uint8Array {
  const stride = width * channels
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  const ihdr = new Uint8Array(13)
  const v = new DataView(ihdr.buffer)
  v.setUint32(0, width)
  v.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = channels === 1 ? 0 : channels === 3 ? 2 : 6
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let k = 0
  for (const p of parts) {
    out.set(p, k)
    k += p.length
  }
  return out
}

const nameOf = (o: PDFObject | undefined) => (o instanceof PDFName ? o.decodeText() : undefined)
const numOf = (o: PDFObject | undefined) => (o instanceof PDFNumber ? o.asNumber() : undefined)

function filters(doc: PDFDocument, dict: PDFDict): string[] {
  const f = dict.lookup(PDFName.of('Filter'))
  if (f instanceof PDFName) return [f.decodeText()]
  if (f instanceof PDFArray) return f.asArray().map((x) => nameOf(doc.context.lookup(x)) ?? '?')
  return []
}

type Space = { kind: 'gray' | 'rgb' | 'cmyk' | 'indexed'; n: number; palette?: Uint8Array; hival?: number } | null

/** Không gian màu ảnh; null nếu không hiểu (Lab, Separation, ...). */
function colorSpace(doc: PDFDocument, cs: PDFObject | undefined): Space {
  const o = cs instanceof PDFRef ? doc.context.lookup(cs) : cs
  const nm = nameOf(o)
  if (nm) {
    if (nm === 'DeviceGray' || nm === 'G' || nm === 'CalGray') return { kind: 'gray', n: 1 }
    if (nm === 'DeviceRGB' || nm === 'RGB' || nm === 'CalRGB') return { kind: 'rgb', n: 3 }
    if (nm === 'DeviceCMYK' || nm === 'CMYK') return { kind: 'cmyk', n: 4 }
    return null
  }
  if (o instanceof PDFArray) {
    const head = nameOf(doc.context.lookup(o.get(0)))
    if (head === 'ICCBased') {
      const st = doc.context.lookup(o.get(1))
      const n = st instanceof PDFRawStream ? numOf(st.dict.lookup(PDFName.of('N'))) : undefined
      return n === 1 ? { kind: 'gray', n: 1 } : n === 3 ? { kind: 'rgb', n: 3 } : n === 4 ? { kind: 'cmyk', n: 4 } : null
    }
    if (head === 'CalRGB') return { kind: 'rgb', n: 3 }
    if (head === 'CalGray') return { kind: 'gray', n: 1 }
    if (head === 'Indexed' || head === 'I') {
      const base = colorSpace(doc, doc.context.lookup(o.get(1)))
      const hival = numOf(doc.context.lookup(o.get(2)))
      const lk = doc.context.lookup(o.get(3))
      if (!base || base.kind === 'indexed' || hival === undefined) return null
      let table: Uint8Array | undefined
      if (lk instanceof PDFRawStream) table = decodePDFRawStream(lk).decode()
      else if (lk instanceof PDFString || lk instanceof PDFHexString) table = lk.asBytes()
      return table ? { kind: 'indexed', n: 1, palette: table, hival, ...{ base } } as Space : null
    }
  }
  return null
}

/** Giải các mẫu 1/2/4/8 bit thành mảng mỗi mẫu một byte (giữ giá trị gốc, không co về 0–255). */
function unpack(raw: Uint8Array, width: number, height: number, comps: number, bpc: number): Uint8Array | null {
  if (bpc === 8) return raw.length >= width * height * comps ? raw : null
  if (![1, 2, 4].includes(bpc)) return null
  const rowBytes = Math.ceil((width * comps * bpc) / 8)
  if (raw.length < rowBytes * height) return null
  const out = new Uint8Array(width * height * comps)
  const mask = (1 << bpc) - 1
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < width * comps; i++) {
      const bit = i * bpc
      out[y * width * comps + i] = (raw[y * rowBytes + (bit >> 3)]! >> (8 - bpc - (bit & 7))) & mask
    }
  }
  return out
}

/** Ảnh nền của một XObject ảnh (JPEG giữ nguyên; ảnh điểm ảnh thô chuyển PNG). null nếu loại ảnh chưa hỗ trợ. */
function extractOne(doc: PDFDocument, stream: PDFRawStream): ExtractedImage | null {
  const dict = stream.dict
  const width = numOf(dict.lookup(PDFName.of('Width')))
  const height = numOf(dict.lookup(PDFName.of('Height')))
  if (!width || !height || width * height > MAX_PIXELS) return null
  if (dict.lookup(PDFName.of('ImageMask')) !== undefined && String(dict.lookup(PDFName.of('ImageMask'))) === 'true') return null
  const fl = filters(doc, dict)
  const space = colorSpace(doc, dict.lookup(PDFName.of('ColorSpace')))
  if (!space) return null

  if (fl.length === 1 && fl[0] === 'DCTDecode') {
    if (space.kind === 'cmyk' || space.kind === 'indexed') return null
    return { data: stream.contents, ext: 'jpeg', width, height }
  }
  if (fl.some((f) => !['FlateDecode', 'Fl', 'LZWDecode', 'ASCII85Decode', 'ASCIIHexDecode', 'RunLengthDecode'].includes(f))) return null

  const bpc = numOf(dict.lookup(PDFName.of('BitsPerComponent'))) ?? 8
  let raw: Uint8Array
  try {
    raw = decodePDFRawStream(stream).decode()
  } catch {
    return null
  }
  const samples = unpack(raw, width, height, space.n, bpc)
  if (!samples) return null
  const max = (1 << bpc) - 1

  // Dựng RGB/Xám 8 bit.
  let rgb: Uint8Array
  let channels: 1 | 3 = 3
  if (space.kind === 'rgb') {
    rgb = bpc === 8 ? samples : samples.map((s) => Math.round((s * 255) / max))
  } else if (space.kind === 'gray') {
    channels = 1
    rgb = bpc === 8 ? samples : samples.map((s) => Math.round((s * 255) / max))
  } else if (space.kind === 'cmyk') {
    rgb = new Uint8Array(width * height * 3)
    for (let i = 0; i < width * height; i++) {
      const c = samples[i * 4]! / max, m = samples[i * 4 + 1]! / max, y = samples[i * 4 + 2]! / max, k = samples[i * 4 + 3]! / max
      rgb[i * 3] = Math.round(255 * (1 - c) * (1 - k))
      rgb[i * 3 + 1] = Math.round(255 * (1 - m) * (1 - k))
      rgb[i * 3 + 2] = Math.round(255 * (1 - y) * (1 - k))
    }
  } else {
    const base = (space as unknown as { base: Space }).base!
    const pal = space.palette!
    rgb = new Uint8Array(width * height * 3)
    for (let i = 0; i < width * height; i++) {
      const idx = Math.min(samples[i]!, space.hival!)
      if (base.kind === 'rgb') for (let c = 0; c < 3; c++) rgb[i * 3 + c] = pal[idx * 3 + c] ?? 0
      else if (base.kind === 'gray') rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = pal[idx] ?? 0
      else return null
    }
  }

  // Độ trong suốt từ SMask (xám 8 bit); khác kích thước thì lấy mẫu gần nhất.
  const sm = doc.context.lookup(dict.get(PDFName.of('SMask')))
  if (sm instanceof PDFRawStream) {
    const sw = numOf(sm.dict.lookup(PDFName.of('Width'))) ?? width
    const sh = numOf(sm.dict.lookup(PDFName.of('Height'))) ?? height
    const sbpc = numOf(sm.dict.lookup(PDFName.of('BitsPerComponent'))) ?? 8
    const alpha = ((): Uint8Array | null => {
      try {
        return unpack(decodePDFRawStream(sm).decode(), sw, sh, 1, sbpc)
      } catch {
        return null
      }
    })()
    if (alpha && filters(doc, sm.dict).every((f) => f !== 'DCTDecode' && f !== 'JPXDecode')) {
      const smax = (1 << sbpc) - 1
      const rgba = new Uint8Array(width * height * 4)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const o = (y * width + x) * 4
          const i = y * width + x
          if (channels === 3) { rgba[o] = rgb[i * 3]!; rgba[o + 1] = rgb[i * 3 + 1]!; rgba[o + 2] = rgb[i * 3 + 2]! }
          else rgba[o] = rgba[o + 1] = rgba[o + 2] = rgb[i]!
          const a = alpha[Math.min(sh - 1, Math.floor((y * sh) / height)) * sw + Math.min(sw - 1, Math.floor((x * sw) / width))]!
          rgba[o + 3] = Math.round((a * 255) / smax)
        }
      }
      return { data: encodePng(rgba, width, height, 4), ext: 'png', width, height }
    }
  }
  return { data: encodePng(rgb.subarray(0, width * height * channels), width, height, channels), ext: 'png', width, height }
}

/** Ảnh trên một trang theo tên tài nguyên (XObject); thiếu = không hỗ trợ hoặc không phải ảnh. Cùng một ảnh dùng lại thì giải một lần. */
export function pageImages(doc: PDFDocument, pageIndex: number, cache: Map<string, ExtractedImage | null>): { isImage: (name: string) => boolean; get: (name: string) => ExtractedImage | null; key: (name: string) => string } {
  const xobjects = doc.getPage(pageIndex).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)
  const stream = (name: string) => {
    const o = xobjects?.lookup(PDFName.of(name))
    return o instanceof PDFRawStream && nameOf(o.dict.lookup(PDFName.of('Subtype'))) === 'Image' ? o : null
  }
  const refKey = (name: string) => {
    const r = xobjects?.get(PDFName.of(name))
    return r instanceof PDFRef ? r.tag : `p${pageIndex}:${name}`
  }
  return {
    isImage: (name) => stream(name) !== null,
    key: refKey,
    get(name) {
      const k = refKey(name)
      if (cache.has(k)) return cache.get(k)!
      const st = stream(name)
      const img = ((): ExtractedImage | null => {
        try {
          return st ? extractOne(doc, st) : null
        } catch {
          return null
        }
      })()
      cache.set(k, img)
      return img
    },
  }
}
