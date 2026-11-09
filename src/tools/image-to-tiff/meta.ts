import { FileImage } from 'lucide-react'
import { imageInputs } from '../_shared/imageInputs'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'image-to-tiff',
  kind: 'image',
  group: 'imgconvert',
  icon: FileImage,
  inputs: imageInputs(),
  params: [],
}
