import { Scissors } from 'lucide-react'
import type { ToolMeta } from '../types'
import { rangesParam } from '../_ranges-meta'

export const meta: ToolMeta = {
  id: 'split',
  group: 'organize',
  icon: Scissors,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [
    {
      key: 'mode',
      type: 'select',
      labelKey: 'params.splitMode.label',
      default: 'ranges',
      options: [
        { value: 'ranges', labelKey: 'params.splitMode.ranges' },
        { value: 'each', labelKey: 'params.splitMode.each' },
      ],
    },
    rangesParam('ranges', 'params.ranges.splitHint'),
  ],
}
