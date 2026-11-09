import { extOf } from './mime'

export type SourceKind = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'image' | 'text' | 'unknown'

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.tif', '.tiff']

export function detectKind(name: string): SourceKind {
  const e = extOf(name)
  if (e === '.pdf') return 'pdf'
  if (e === '.docx') return 'docx'
  if (e === '.xlsx') return 'xlsx'
  if (e === '.pptx') return 'pptx'
  if (e === '.txt') return 'text'
  if (IMAGE_EXT.includes(e)) return 'image'
  return 'unknown'
}

/** Công cụ phù hợp để chuyển tệp thuộc loại này (id công cụ, theo thứ tự gợi ý). */
export function targetsFor(name: string): string[] {
  switch (detectKind(name)) {
    case 'pdf':
      return ['pdf-to-docx', 'pdf-to-xlsx', 'pdf-to-pptx', 'pdf-to-images', 'ocr']
    case 'docx':
      return ['docx-to-pdf']
    case 'xlsx':
      return ['xlsx-to-pdf']
    case 'pptx':
      return ['pptx-to-pdf']
    case 'text':
      return ['text-to-pdf']
    case 'image': {
      const e = extOf(name)
      // Ảnh sang PDF chỉ nhận JPG/PNG; các định dạng khác vẫn đổi định dạng và nhận dạng chữ được.
      return [...(['.png', '.jpg', '.jpeg'].includes(e) ? ['images-to-pdf'] : []), 'ocr', 'image-convert']
    }
    default:
      return []
  }
}
