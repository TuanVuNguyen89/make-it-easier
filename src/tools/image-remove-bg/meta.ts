import { Eraser } from 'lucide-react'
import { imageInputs } from '../_shared/imageInputs'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'image-remove-bg',
  kind: 'image',
  group: 'modify',
  icon: Eraser,
  inputs: imageInputs(),
  params: [
    { key: 'tolerance', type: 'number', labelKey: 'params.removeBg.tolerance', hintKey: 'params.removeBg.hint', default: 30, min: 1, max: 100 },
    { key: 'feather', type: 'boolean', labelKey: 'params.removeBg.feather', default: true },
  ],
}
