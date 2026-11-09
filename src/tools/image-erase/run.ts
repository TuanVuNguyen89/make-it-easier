import { dilateMask, inpaint } from '@/lib/imageOps'
import { mapImages } from '../_shared/imageTool'
import { ToolError, type RunFn } from '../types'

/** Xóa đối tượng đã tô: vùng mask (khác 0, cùng kích thước ảnh) được vá bằng màu xung quanh. */
export const run: RunFn<{ mask: Uint8Array; maskWidth: number; maskHeight: number }> = async (inputs, options, ctx) => {
  if (!(options.mask instanceof Uint8Array) || !options.mask.some((v) => v)) throw new ToolError('invalid-options', 'Paint the area to erase first')
  return mapImages(inputs, ctx, '-erased', (bm) => {
    if (options.maskWidth !== bm.width || options.maskHeight !== bm.height) throw new ToolError('invalid-options', 'Mask size does not match the image')
    // Nới vùng tô vài pixel để không sót viền vật thể (viền sót sẽ bị coi là "màu xung quanh" và làm lem màu).
    const grown = dilateMask(options.mask, bm.width, bm.height, Math.max(2, Math.round(Math.max(bm.width, bm.height) / 200)))
    return { bitmap: inpaint(bm, grown) }
  })
}
