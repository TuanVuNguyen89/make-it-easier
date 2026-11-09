import { MIME, baseName, decodeImage, encodeImage, sniffFormat, type ImageFormat } from '@/lib/image'
import { throwIfAborted } from '@/lib/abort'
import type { Bitmap } from '@/lib/imageOps'
import type { RunContext, ToolOutput } from '../types'

/** Định dạng đầu ra mặc định khi giữ nguyên: ảnh vào là gì thì ra như vậy, trừ GIF/BMP (ra PNG). */
export function keepFormat(bytes: Uint8Array): ImageFormat {
  const f = sniffFormat(bytes)
  return f === 'gif' || f === 'bmp' || f === null ? 'png' : f
}

const EXT: Record<ImageFormat, string> = { png: 'png', jpg: 'jpg', webp: 'webp', tiff: 'tiff', avif: 'avif' }

/** Chạy một phép biến đổi cho từng ảnh, đặt tên `<tên gốc><hậu tố>.<đuôi>`, báo tiến trình và kiểm tra hủy. */
export async function mapImages(
  inputs: Uint8Array[],
  ctx: RunContext,
  suffix: string,
  fn: (bm: Bitmap, bytes: Uint8Array, index: number) => Promise<{ bitmap: Bitmap; format?: ImageFormat; quality?: number }> | { bitmap: Bitmap; format?: ImageFormat; quality?: number },
): Promise<ToolOutput[]> {
  const outputs: ToolOutput[] = []
  for (let i = 0; i < inputs.length; i++) {
    throwIfAborted(ctx.signal)
    const bytes = inputs[i]!
    const { bitmap, format = keepFormat(bytes), quality = 90 } = await fn(await decodeImage(bytes), bytes, i)
    throwIfAborted(ctx.signal)
    outputs.push({
      name: `${baseName(ctx.names?.[i], `image-${i + 1}`)}${suffix}.${EXT[format]}`,
      mime: MIME[format],
      data: await encodeImage(bitmap, format, quality),
    })
    ctx.progress((i + 1) / inputs.length)
  }
  return outputs
}
