import { FileText } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'docx-to-pdf',
  group: 'convert',
  icon: FileText,
  inputs: { extensions: ['.docx'], mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], min: 1, max: 1, ordered: false },
  params: [],
}
