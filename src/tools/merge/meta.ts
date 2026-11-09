import { Combine } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'merge',
  group: 'organize',
  icon: Combine,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 2, max: 50, ordered: true },
  params: [],
}
