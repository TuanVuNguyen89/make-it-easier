import { Presentation } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'pdf-to-pptx',
  group: 'convert',
  icon: Presentation,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [],
}
