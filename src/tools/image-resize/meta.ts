import { Scaling } from 'lucide-react'
import { imageInputs } from '../_shared/imageInputs'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'image-resize',
  kind: 'image',
  group: 'modify',
  icon: Scaling,
  inputs: imageInputs(),
  params: [
    {
      key: 'mode',
      type: 'select',
      labelKey: 'params.resize.mode',
      default: 'percent',
      options: [
        { value: 'percent', labelKey: 'params.resize.percent' },
        { value: 'pixels', labelKey: 'params.resize.pixels' },
      ],
    },
    { key: 'percent', type: 'number', labelKey: 'params.resize.percentValue', default: 50, min: 1, max: 400 },
    { key: 'width', type: 'number', labelKey: 'params.resize.width', hintKey: 'params.resize.pixelsHint', default: 0, min: 0, max: 20000 },
    { key: 'height', type: 'number', labelKey: 'params.resize.height', default: 0, min: 0, max: 20000 },
    { key: 'keepAspect', type: 'boolean', labelKey: 'params.resize.keepAspect', default: true },
  ],
}
