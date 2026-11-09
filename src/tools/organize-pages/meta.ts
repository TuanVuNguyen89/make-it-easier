import { LayoutGrid } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'organize-pages',
  group: 'organize',
  icon: LayoutGrid,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [],
  editor: 'pages',
}
