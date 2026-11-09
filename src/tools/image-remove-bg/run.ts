import { removeBackground } from '@/lib/imageOps'
import { mapImages } from '../_shared/imageTool'
import { ToolError, type RunFn } from '../types'

/** Xóa nền đồng màu (loang từ rìa). Luôn xuất PNG vì cần kênh trong suốt. */
export const run: RunFn<{ tolerance: number; feather: boolean }> = async (inputs, options, ctx) => {
  const tolerance = Number(options.tolerance)
  if (!(tolerance >= 1 && tolerance <= 100)) throw new ToolError('invalid-options', 'Tolerance out of range')
  return mapImages(inputs, ctx, '-no-bg', (bm) => ({ bitmap: removeBackground(bm, tolerance, options.feather ? 1 : 0), format: 'png' }))
}
