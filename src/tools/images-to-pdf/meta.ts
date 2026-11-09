import { ImagePlus } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'images-to-pdf',
  group: 'convert',
  icon: ImagePlus,
  inputs: {
    extensions: ['.jpg', '.jpeg', '.png'],
    mimes: ['image/jpeg', 'image/png'],
    min: 1,
    max: 100,
    ordered: true,
  },
  params: [
    {
      key: 'pageSize',
      type: 'select',
      labelKey: 'params.pageSize.label',
      default: 'fit',
      options: [
        { value: 'fit', labelKey: 'params.pageSize.fit' },
        { value: 'a4', labelKey: 'params.pageSize.a4' },
      ],
    },
  ],
}
