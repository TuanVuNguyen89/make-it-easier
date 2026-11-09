import { Crop } from 'lucide-react'
import type { ParamDef, ToolMeta } from '../types'
import { rangesParam } from '../_ranges-meta'

const margin = (key: string): ParamDef => ({ key, type: 'number', labelKey: `params.margin.${key}`, default: 0, min: 0, max: 500 })

export const meta: ToolMeta = {
  id: 'crop-pages',
  group: 'organize',
  icon: Crop,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [rangesParam('ranges', 'params.ranges.allCropHint'), margin('top'), margin('right'), margin('bottom'), margin('left')],
}
