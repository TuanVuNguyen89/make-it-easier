import { Presentation } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'pptx-to-pdf',
  group: 'convert',
  icon: Presentation,
  inputs: { extensions: ['.pptx'], mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], min: 1, max: 1, ordered: false },
  params: [],
}
