import UPNG from 'upng-js'
import { baseName, decodeImage, encodeImage, MIME, type ImageFormat } from '@/lib/image'
import { throwIfAborted } from '@/lib/pdf'
import { keepFormat } from '../_shared/imageTool'
import { ToolError, type RunFn, type ToolOutput } from '../types'

/**
 * Nén theo chất lượng 1..100. JPG/WebP/AVIF nén lại; PNG giảm số màu (palette) vì PNG không có "chất lượng";
 * TIFF/GIF/BMP chuyển sang PNG giảm màu. Chỉ xuất ảnh nhỏ hơn bản gốc; nếu không ảnh nào nhỏ hơn thì báo 'no-reduction'.
 */
export const run: RunFn<{ quality: number }> = async (inputs, options, ctx) => {
  const quality = Number(options.quality)
  if (!(quality >= 1 && quality <= 100)) throw new ToolError('invalid-options', 'Quality out of range')
  const outputs: ToolOutput[] = []
  for (let i = 0; i < inputs.length; i++) {
    throwIfAborted(ctx.signal)
    const bytes = inputs[i]!
    const bm = await decodeImage(bytes)
    const format: ImageFormat = keepFormat(bytes) === 'tiff' ? 'png' : keepFormat(bytes)
    let data: Uint8Array
    if (format === 'png') {
      const colors = Math.max(2, Math.round(2 + (quality / 100) ** 2 * 254)) // 100 -> 256 màu
      const rgba = bm.data.buffer.slice(bm.data.byteOffset, bm.data.byteOffset + bm.data.byteLength) as ArrayBuffer
      data = new Uint8Array(UPNG.encode([rgba], bm.width, bm.height, quality >= 100 ? 0 : colors))
    } else {
      data = await encodeImage(bm, format, quality)
    }
    if (data.byteLength < bytes.byteLength) {
      outputs.push({ name: `${baseName(ctx.names?.[i], `image-${i + 1}`)}-compressed.${format}`, mime: MIME[format], data })
    }
    ctx.progress((i + 1) / inputs.length)
  }
  if (outputs.length === 0) throw new ToolError('no-reduction', 'Already as small as it gets')
  return outputs
}
