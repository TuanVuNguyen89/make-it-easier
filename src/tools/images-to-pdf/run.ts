import { PDFDocument } from 'pdf-lib'
import { throwIfAborted } from '@/lib/pdf'
import { ToolError, type RunFn } from '../types'

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 28
const PX_TO_PT = 0.75 // 96 dpi -> 72 pt/inch

const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
const isJpg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8

/** Mỗi ảnh một trang theo đúng thứ tự đầu vào. "fit": trang vừa khít ảnh; "a4": ảnh co vừa khổ A4, tự xoay ngang nếu ảnh ngang. */
export const run: RunFn<{ pageSize: 'fit' | 'a4' }> = async (inputs, options, ctx) => {
  if (!['fit', 'a4'].includes(options.pageSize)) throw new ToolError('invalid-options', 'Bad page size')
  const doc = await PDFDocument.create()
  for (let i = 0; i < inputs.length; i++) {
    throwIfAborted(ctx.signal)
    const bytes = inputs[i]!
    let img
    try {
      if (isPng(bytes)) img = await doc.embedPng(bytes)
      else if (isJpg(bytes)) img = await doc.embedJpg(bytes)
      else throw new Error('unsupported')
    } catch {
      throw new ToolError('invalid-image', `Image ${i + 1} could not be read`)
    }
    if (options.pageSize === 'fit') {
      const w = img.width * PX_TO_PT
      const h = img.height * PX_TO_PT
      doc.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h })
    } else {
      const landscape = img.width > img.height
      const [pw, ph] = landscape ? [A4[1], A4[0]] : A4
      const scale = Math.min((pw - 2 * MARGIN) / img.width, (ph - 2 * MARGIN) / img.height, 1 / PX_TO_PT)
      const w = img.width * scale
      const h = img.height * scale
      doc.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h })
    }
    ctx.progress((i + 1) / inputs.length)
  }
  return [{ name: 'images.pdf', mime: 'application/pdf', data: await doc.save() }]
}
