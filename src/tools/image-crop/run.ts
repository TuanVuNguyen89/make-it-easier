import { crop } from '@/lib/imageOps'
import { mapImages } from '../_shared/imageTool'
import type { RunFn } from '../types'

export const run: RunFn<{ x: number; y: number; width: number; height: number }> = (inputs, options, ctx) =>
  mapImages(inputs, ctx, '-cropped', (bm) => ({
    bitmap: crop(bm, Math.round(Number(options.x)), Math.round(Number(options.y)), Math.round(Number(options.width)), Math.round(Number(options.height))),
  }))
