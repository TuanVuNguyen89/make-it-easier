import { PDFDocument } from 'pdf-lib'
import { loadUnicodeFont } from '@/lib/fonts'
import { throwIfAborted } from '@/lib/pdf'
import { ToolError, type RunFn } from '../types'

const PAGE: [number, number] = [595.28, 841.89]
const MARGIN = 56

/** Chuyển văn bản UTF-8 thành PDF: tự xuống dòng theo bề rộng, tự sang trang, hỗ trợ tiếng Việt có dấu. */
export const run: RunFn<{ size: number }> = async (inputs, options, ctx) => {
  const size = Number(options.size)
  if (!(size >= 8 && size <= 32)) throw new ToolError('invalid-options', 'Bad font size')
  const text = new TextDecoder('utf-8').decode(inputs[0]!).replace(/^\uFEFF/, '')
  if (!text.trim()) throw new ToolError('invalid-options', 'Text file is empty')

  const doc = await PDFDocument.create()
  const fontkit = (await import('@pdf-lib/fontkit')).default
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(await loadUnicodeFont(), { subset: true })
  const maxWidth = PAGE[0] - 2 * MARGIN
  const lineHeight = size * 1.4

  const lines: string[] = []
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const para = raw.replace(/\t/g, '    ')
    if (para === '') {
      lines.push('')
      continue
    }
    // Giữ khoảng trắng đầu dòng (thụt lề); ngắt theo từ, từ quá dài thì ngắt theo ký tự.
    const indent = /^ */.exec(para)![0]
    let current = indent
    for (const word of para.slice(indent.length).split(/(?<= )/)) {
      if (font.widthOfTextAtSize((current + word).trimEnd(), size) <= maxWidth) {
        current += word
        continue
      }
      if (current.trim()) lines.push(current.trimEnd())
      current = indent
      let rest = word
      while (font.widthOfTextAtSize(rest.trimEnd(), size) > maxWidth) {
        let cut = rest.length - 1
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--
        lines.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      current += rest
    }
    lines.push(current.trimEnd())
  }

  const perPage = Math.floor((PAGE[1] - 2 * MARGIN) / lineHeight)
  for (let start = 0; start < lines.length; start += perPage) {
    throwIfAborted(ctx.signal)
    const page = doc.addPage(PAGE)
    lines.slice(start, start + perPage).forEach((line, i) => {
      if (line) page.drawText(line, { x: MARGIN, y: PAGE[1] - MARGIN - size - i * lineHeight, size, font })
    })
    ctx.progress(Math.min(1, (start + perPage) / lines.length))
  }
  return [{ name: 'text.pdf', mime: 'application/pdf', data: await doc.save() }]
}
