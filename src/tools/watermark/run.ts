import { degrees, rgb } from 'pdf-lib'
import { loadUnicodeFont } from '@/lib/fonts'
import { loadPdf, throwIfAborted } from '@/lib/pdf'
import { visualFrame } from '@/lib/pageGeometry'
import { parseRanges } from '@/lib/ranges'
import { ToolError, type RunFn } from '../types'

interface Options {
  text: string
  size: number
  scale: number
  opacity: number
  angle: number
  ranges: string
}

const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 // %PDF
const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
const isJpg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8

/** Hình mờ chữ (hỗ trợ tiếng Việt có dấu) hoặc ảnh, đặt giữa trang, xoay theo góc, đứng đúng hướng nhìn thấy. */
export const run: RunFn<Options> = async (inputs, options, ctx) => {
  const pdfs = inputs.filter(isPdf)
  const images = inputs.filter((b) => isPng(b) || isJpg(b))
  if (pdfs.length === 0) throw new ToolError('invalid-pdf', 'No PDF input')
  if (pdfs.length > 1 || pdfs.length + images.length !== inputs.length) {
    throw new ToolError('invalid-options', 'Provide one PDF and at most one image')
  }
  const text = (options.text ?? '').trim()
  if (images.length === 0 && !text) throw new ToolError('invalid-options', 'Watermark text or image is required')
  const size = Number(options.size)
  const opacity = Number(options.opacity) / 100
  const angle = Number(options.angle)
  const scale = Number(options.scale) / 100
  if (!(opacity > 0 && opacity <= 1) || !Number.isFinite(angle) || (images.length === 0 && !(size >= 8 && size <= 200)) || (images.length > 0 && !(scale > 0 && scale <= 1))) {
    throw new ToolError('invalid-options', 'Bad watermark options')
  }

  const doc = await loadPdf(pdfs[0]!)
  const targets = options.ranges?.trim() ? parseRanges(options.ranges, doc.getPageCount()) : doc.getPageIndices()

  let draw: (pageIndex: number) => void
  if (images.length > 0) {
    const img = isPng(images[0]!) ? await doc.embedPng(images[0]!) : await doc.embedJpg(images[0]!)
    draw = (i) => {
      const page = doc.getPage(i)
      const f = visualFrame(page)
      const w = f.vw * scale
      const h = (img.height / img.width) * w
      placeCentered(f, w, h, angle, (x, y, rot) => page.drawImage(img, { x, y, width: w, height: h, rotate: degrees(rot), opacity }))
    }
  } else {
    const fontkit = (await import('@pdf-lib/fontkit')).default
    doc.registerFontkit(fontkit)
    const font = await doc.embedFont(await loadUnicodeFont(), { subset: true })
    const w = font.widthOfTextAtSize(text, size)
    const h = size * 0.72 // chiều cao chữ hoa xấp xỉ, dùng để canh giữa theo chiều dọc
    draw = (i) => {
      const page = doc.getPage(i)
      const f = visualFrame(page)
      placeCentered(f, w, h, angle, (x, y, rot) =>
        page.drawText(text, { x, y, size, font, rotate: degrees(rot), color: rgb(0.45, 0.45, 0.45), opacity }),
      )
    }
  }

  let done = 0
  for (const i of new Set(targets)) {
    throwIfAborted(ctx.signal)
    draw(i)
    ctx.progress(++done / targets.length)
  }
  return [{ name: 'watermarked.pdf', mime: 'application/pdf', data: await doc.save() }]
}

/**
 * Đặt vật thể rộng w, cao h sao cho tâm nằm giữa trang nhìn thấy, xoay `angle` độ (ngược chiều kim đồng hồ).
 * Điểm neo của pdf-lib là góc dưới-trái của vật thể, nên phải lùi từ tâm theo hướng đã xoay.
 */
function placeCentered(
  f: ReturnType<typeof visualFrame>,
  w: number,
  h: number,
  angle: number,
  paint: (x: number, y: number, rotation: number) => void,
) {
  const rad = (angle * Math.PI) / 180
  const vx = f.vw / 2 - ((w / 2) * Math.cos(rad) - (h / 2) * Math.sin(rad))
  const vy = f.vh / 2 - ((w / 2) * Math.sin(rad) + (h / 2) * Math.cos(rad))
  const { x, y } = f.toPage(vx, vy)
  paint(x, y, angle + f.rotation)
}

