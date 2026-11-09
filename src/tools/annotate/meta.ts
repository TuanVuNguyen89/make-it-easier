import { Highlighter } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'annotate',
  group: 'markup',
  icon: Highlighter,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [],
  editor: 'pdf-annotate',
}
