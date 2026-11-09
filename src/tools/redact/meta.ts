import { EyeOff } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'redact',
  group: 'markup',
  icon: EyeOff,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [],
  editor: 'pdf-redact',
}
