import { Minimize2 } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'compress',
  group: 'secure',
  icon: Minimize2,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [],
  showSizeDelta: true,
}
