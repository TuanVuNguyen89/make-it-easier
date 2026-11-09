import { ListOrdered } from 'lucide-react'
import type { ToolMeta } from '../types'
import { rangesParam } from '../_ranges-meta'

const pos = (v: string) => ({ value: v, labelKey: `params.position.${v}` })

export const meta: ToolMeta = {
  id: 'page-numbers',
  group: 'organize',
  icon: ListOrdered,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [
    {
      key: 'position',
      type: 'select',
      labelKey: 'params.position.label',
      default: 'bottom-center',
      options: ['bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right', 'top-left'].map(pos),
    },
    {
      key: 'format',
      type: 'select',
      labelKey: 'params.numFormat.label',
      default: 'n',
      options: [
        { value: 'n', labelKey: 'params.numFormat.n' },
        { value: 'n-of-total', labelKey: 'params.numFormat.nOfTotal' },
      ],
    },
    { key: 'start', type: 'number', labelKey: 'params.numStart', default: 1, min: 0, max: 9999 },
    { key: 'size', type: 'number', labelKey: 'params.fontSize', default: 11, min: 6, max: 48 },
    rangesParam('ranges', 'params.ranges.allNumberHint'),
  ],
}
