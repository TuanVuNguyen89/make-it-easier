import { Crop } from 'lucide-react'
import { imageInputs } from '../_shared/imageInputs'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'image-crop',
  kind: 'image',
  group: 'modify',
  icon: Crop,
  inputs: imageInputs(1),
  params: [],
  editor: 'image-crop',
}
