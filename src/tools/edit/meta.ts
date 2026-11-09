import { FilePenLine } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'edit',
  group: 'markup',
  icon: FilePenLine,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [],
  editor: 'pdf-edit',
}
