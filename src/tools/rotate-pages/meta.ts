import { RotateCw } from 'lucide-react'
import type { ToolMeta } from '../types'
import { rangesParam } from '../_ranges-meta'

export const meta: ToolMeta = {
  id: 'rotate-pages',
  group: 'organize',
  icon: RotateCw,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [
    rangesParam('ranges', 'params.ranges.allHint'),
    {
      key: 'angle',
      type: 'select',
      labelKey: 'params.angle.label',
      default: '90',
      options: [
        { value: '90', labelKey: 'params.angle.cw90' },
        { value: '180', labelKey: 'params.angle.r180' },
        { value: '270', labelKey: 'params.angle.ccw90' },
      ],
    },
  ],
}
