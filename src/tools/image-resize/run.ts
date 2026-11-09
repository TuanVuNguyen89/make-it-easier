import { resize } from '@/lib/imageOps'
import { mapImages } from '../_shared/imageTool'
import { ToolError, type RunFn } from '../types'

interface Options {
  mode: 'percent' | 'pixels'
  percent: number
  width: number
  height: number
  keepAspect: boolean
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export const run: RunFn<Options> = async (inputs, options, ctx) => {
  const mode = options.mode
  if (mode !== 'percent' && mode !== 'pixels') throw new ToolError('invalid-options', 'Bad mode')
  const percent = n(options.percent)
  const width = Math.round(n(options.width))
  const height = Math.round(n(options.height))
  if (mode === 'percent' && !(percent >= 1 && percent <= 400)) throw new ToolError('invalid-options', 'Percent out of range')
  if (mode === 'pixels') {
    if (width < 0 || height < 0 || (options.keepAspect ? width + height === 0 : !(width > 0 && height > 0))) {
      throw new ToolError('invalid-options', 'Width and height are required')
    }
  }
  return mapImages(inputs, ctx, '-resized', (bm) => {
    const { width: w, height: h } = bm
    let tw: number
    let th: number
    if (mode === 'percent') {
      tw = Math.max(1, Math.round((w * percent) / 100))
      th = Math.max(1, Math.round((h * percent) / 100))
    } else if (options.keepAspect) {
      // Có chiều rộng thì theo chiều rộng, nếu không thì theo chiều cao.
      if (width > 0) [tw, th] = [width, Math.max(1, Math.round((h * width) / w))]
      else [tw, th] = [Math.max(1, Math.round((w * height) / h)), height]
    } else {
      ;[tw, th] = [width, height]
    }
    return { bitmap: resize(bm, tw, th) }
  })
}
