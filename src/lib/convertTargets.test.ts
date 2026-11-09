import { describe, expect, it } from 'vitest'
import { detectKind, targetsFor } from './convertTargets'

describe('convertTargets', () => {
  it('nhận loại tệp theo đuôi, không phân biệt hoa thường', () => {
    expect(detectKind('A.PDF')).toBe('pdf')
    expect(detectKind('b.DocX')).toBe('docx')
    expect(detectKind('c.tiff')).toBe('image')
    expect(detectKind('d.txt')).toBe('text')
    expect(detectKind('e.zip')).toBe('unknown')
    expect(detectKind('khongduoi')).toBe('unknown')
  })
  it('gợi ý đúng công cụ đích cho từng loại', () => {
    expect(targetsFor('a.pdf')).toEqual(['pdf-to-docx', 'pdf-to-xlsx', 'pdf-to-pptx', 'pdf-to-images', 'ocr'])
    expect(targetsFor('a.docx')).toEqual(['docx-to-pdf'])
    expect(targetsFor('a.xlsx')).toEqual(['xlsx-to-pdf'])
    expect(targetsFor('a.pptx')).toEqual(['pptx-to-pdf'])
    expect(targetsFor('a.txt')).toEqual(['text-to-pdf'])
    expect(targetsFor('a.zip')).toEqual([])
  })
  it('ảnh JPG/PNG có thêm "ảnh sang PDF"; định dạng khác thì không', () => {
    expect(targetsFor('a.png')).toEqual(['images-to-pdf', 'ocr', 'image-convert'])
    expect(targetsFor('a.JPG')).toContain('images-to-pdf')
    expect(targetsFor('a.webp')).toEqual(['ocr', 'image-convert'])
  })
})
