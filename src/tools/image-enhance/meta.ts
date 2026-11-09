import { Sparkles } from 'lucide-react'
import { imageInputs } from '../_shared/imageInputs'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'image-enhance',
  kind: 'image',
  group: 'optimize',
  icon: Sparkles,
  inputs: imageInputs(),
  params: [
    {
      key: 'scale',
      type: 'select',
      labelKey: 'params.enhance.scale',
      default: '2',
      options: ['1', '2', '3', '4'].map((v) => ({ value: v, labelKey: `params.enhance.x${v}` })),
    },
    { key: 'sharpen', type: 'number', labelKey: 'params.enhance.sharpen', hintKey: 'params.enhance.sharpenHint', default: 40, min: 0, max: 100 },
    { key: 'levels', type: 'boolean', labelKey: 'params.enhance.levels', hintKey: 'params.enhance.levelsHint', default: false },
  ],
}
