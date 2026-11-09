import { ScanText } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'ocr',
  group: 'convert',
  icon: ScanText,
  inputs: {
    extensions: ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp'],
    mimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/tiff', 'image/bmp'],
    min: 1,
    max: 1,
    ordered: false,
  },
  params: [
    {
      key: 'language',
      type: 'select',
      labelKey: 'params.ocr.language',
      hintKey: 'params.ocr.hint',
      default: 'vie+eng',
      options: [
        { value: 'vie+eng', labelKey: 'params.ocr.vieEng' },
        { value: 'vie', labelKey: 'params.ocr.vie' },
        { value: 'eng', labelKey: 'params.ocr.eng' },
      ],
    },
  ],
}
