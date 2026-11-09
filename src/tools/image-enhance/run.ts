import { autoLevels, resize, sharpen } from '@/lib/imageOps'
import { mapImages } from '../_shared/imageTool'
import { ToolError, type RunFn } from '../types'

/** Tăng cường bằng phương pháp cổ điển: phóng to có nội suy, làm nét (unsharp mask), tùy chọn cân bằng màu. Không dùng AI. */
export const run: RunFn<{ scale: string | number; sharpen: number; levels: boolean }> = async (inputs, options, ctx) => {
  const scale = Number(options.scale)
  const amount = Number(options.sharpen)
  if (![1, 2, 3, 4].includes(scale) || !(amount >= 0 && amount <= 100)) throw new ToolError('invalid-options', 'Bad enhance options')
  return mapImages(inputs, ctx, '-enhanced', (bm) => {
    let out = scale > 1 ? resize(bm, bm.width * scale, bm.height * scale) : bm
    if (options.levels) out = autoLevels(out)
    // Ảnh phóng to cần làm nét mạnh hơn một chút để bù độ mềm do nội suy.
    if (amount > 0) out = sharpen(out, (amount / 100) * (1 + (scale - 1) * 0.25))
    return { bitmap: out }
  })
}
