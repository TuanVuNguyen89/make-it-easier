import { Wrench } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'repair',
  group: 'secure',
  icon: Wrench,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [],
}
