import { Sheet } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'xlsx-to-pdf',
  group: 'convert',
  icon: Sheet,
  inputs: { extensions: ['.xlsx'], mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], min: 1, max: 1, ordered: false },
  params: [],
}
