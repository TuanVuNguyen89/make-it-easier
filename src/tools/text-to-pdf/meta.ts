import { FileType } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'text-to-pdf',
  group: 'convert',
  icon: FileType,
  inputs: { extensions: ['.txt'], mimes: ['text/plain'], min: 1, max: 1, ordered: false },
  params: [{ key: 'size', type: 'number', labelKey: 'params.fontSize', default: 12, min: 8, max: 32 }],
}
