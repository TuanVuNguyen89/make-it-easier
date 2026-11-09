import { RotateCw } from 'lucide-react'
import { imageInputs } from '../_shared/imageInputs'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'image-rotate',
  kind: 'image',
  group: 'modify',
  icon: RotateCw,
  inputs: imageInputs(),
  params: [
    {
      key: 'angle',
      type: 'select',
      labelKey: 'params.angle.label',
      default: '90',
      options: [
        { value: '90', labelKey: 'params.angle.cw90' },
        { value: '180', labelKey: 'params.angle.r180' },
        { value: '270', labelKey: 'params.angle.ccw90' },
        { value: '0', labelKey: 'params.angle.none' },
      ],
    },
    { key: 'flipH', type: 'boolean', labelKey: 'params.flip.h', default: false },
    { key: 'flipV', type: 'boolean', labelKey: 'params.flip.v', default: false },
  ],
}
