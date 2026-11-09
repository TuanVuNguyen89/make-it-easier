import { ImageDown } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'pdf-to-images',
  group: 'convert',
  icon: ImageDown,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [
    {
      key: 'format',
      type: 'select',
      labelKey: 'params.imageFormat.label',
      default: 'png',
      options: [
        { value: 'png', labelKey: 'params.imageFormat.png' },
        { value: 'jpg', labelKey: 'params.imageFormat.jpg' },
      ],
    },
    {
      key: 'dpi',
      type: 'select',
      labelKey: 'params.dpi.label',
      default: '150',
      options: [
        { value: '72', labelKey: 'params.dpi.72' },
        { value: '150', labelKey: 'params.dpi.150' },
        { value: '300', labelKey: 'params.dpi.300' },
      ],
    },
  ],
}
