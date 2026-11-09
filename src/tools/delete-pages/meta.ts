import { Trash2 } from 'lucide-react'
import type { ToolMeta } from '../types'
import { rangesParam } from '../_ranges-meta'

export const meta: ToolMeta = {
  id: 'delete-pages',
  group: 'organize',
  icon: Trash2,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [rangesParam('ranges', 'params.ranges.deleteHint')],
}
