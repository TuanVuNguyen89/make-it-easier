import { flip, rotate } from '@/lib/imageOps'
import { mapImages } from '../_shared/imageTool'
import { ToolError, type RunFn } from '../types'

export const run: RunFn<{ angle: string | number; flipH: boolean; flipV: boolean }> = async (inputs, options, ctx) => {
  const angle = Number(options.angle)
  if (![0, 90, 180, 270].includes(angle)) throw new ToolError('invalid-options', 'Bad angle')
  if (angle === 0 && !options.flipH && !options.flipV) throw new ToolError('invalid-options', 'Nothing to do')
  return mapImages(inputs, ctx, '-rotated', (bm) => {
    let out = rotate(bm, angle)
    if (options.flipH || options.flipV) out = flip(out, !!options.flipH, !!options.flipV)
    return { bitmap: out }
  })
}
