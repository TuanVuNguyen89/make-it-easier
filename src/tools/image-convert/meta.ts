import { Repeat } from 'lucide-react'
import { imageInputs } from '../_shared/imageInputs'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'image-convert',
  kind: 'image',
  group: 'imgconvert',
  icon: Repeat,
  inputs: imageInputs(),
  params: [
    {
      key: 'format',
      type: 'select',
      labelKey: 'params.imageFormat.label',
      default: 'png',
      options: ['png', 'jpg', 'webp', 'tiff', 'avif'].map((v) => ({ value: v, labelKey: `params.imageFormat.${v}Short` })),
    },
    { key: 'quality', type: 'number', labelKey: 'params.quality.label', hintKey: 'params.quality.convertHint', default: 90, min: 1, max: 100 },
  ],
}
