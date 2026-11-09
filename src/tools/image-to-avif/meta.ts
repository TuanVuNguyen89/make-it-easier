import { FileImage } from 'lucide-react'
import { imageInputs } from '../_shared/imageInputs'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'image-to-avif',
  kind: 'image',
  group: 'imgconvert',
  icon: FileImage,
  inputs: imageInputs(),
  params: [{ key: 'quality', type: 'number', labelKey: 'params.quality.label', hintKey: 'params.quality.convertHint', default: 90, min: 1, max: 100 }],
}
