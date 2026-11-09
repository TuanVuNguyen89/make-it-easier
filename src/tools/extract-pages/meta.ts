import { FileOutput } from 'lucide-react'
import type { ToolMeta } from '../types'
import { rangesParam } from '../_ranges-meta'

export const meta: ToolMeta = {
  id: 'extract-pages',
  group: 'organize',
  icon: FileOutput,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [rangesParam()],
}
