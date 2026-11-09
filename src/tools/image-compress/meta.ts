import { Minimize2 } from 'lucide-react'
import { imageInputs } from '../_shared/imageInputs'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'image-compress',
  kind: 'image',
  group: 'optimize',
  icon: Minimize2,
  inputs: imageInputs(),
  params: [{ key: 'quality', type: 'number', labelKey: 'params.quality.label', hintKey: 'params.quality.hint', default: 70, min: 1, max: 100 }],
  showSizeDelta: true,
}
