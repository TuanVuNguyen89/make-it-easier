import { Wand } from 'lucide-react'
import { imageInputs } from '../_shared/imageInputs'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'image-erase',
  kind: 'image',
  group: 'modify',
  icon: Wand,
  inputs: imageInputs(1),
  params: [],
  editor: 'image-mask',
}
