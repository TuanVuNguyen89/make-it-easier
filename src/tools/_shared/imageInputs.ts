import { IMAGE_EXTENSIONS, IMAGE_MIMES } from '@/lib/imageTypes'
import type { InputSpec } from '../types'

export const imageInputs = (max = 50): InputSpec => ({ extensions: IMAGE_EXTENSIONS, mimes: IMAGE_MIMES, min: 1, max, ordered: false })
