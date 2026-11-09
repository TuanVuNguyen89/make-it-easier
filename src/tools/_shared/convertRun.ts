import type { ImageFormat } from '@/lib/image'
import { mapImages } from './imageTool'
import { ToolError, type RunFn } from '../types'

const FORMATS: ImageFormat[] = ['png', 'jpg', 'webp', 'tiff', 'avif']

export function convertTo(fixed?: ImageFormat): RunFn<{ format?: ImageFormat; quality?: number }> {
  return async (inputs, options, ctx) => {
    const format = fixed ?? options.format
    const quality = Number(options.quality ?? 90)
    if (!format || !FORMATS.includes(format) || !(quality >= 1 && quality <= 100)) throw new ToolError('invalid-options', 'Bad format or quality')
    return mapImages(inputs, ctx, '', (bitmap) => ({ bitmap, format, quality }))
  }
}
