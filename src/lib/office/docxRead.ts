import { ToolError } from '@/tools/types'
import type { Block, Run } from './blocks'
import { child, kids, parseXml, path, type XNode } from './xml'
import { readText, unzipOffice } from './zip'

const on = (n: XNode | undefined) => !!n && !['0', 'false', 'off'].includes((n.attrs.val ?? '').toLowerCase())

function runsOf(p: XNode): { runs: Run[]; pageBreak: boolean } {
  const runs: Run[] = []
  let pageBreak = false
  const visit = (n: XNode) => {
    for (const c of n.children) {
      if (c.name === 'r') {
        const rPr = child(c, 'rPr')
        const style = { bold: on(child(rPr, 'b')), italic: on(child(rPr, 'i')) }
        let text = ''
        for (const t of c.children) {
          if (t.name === 't') text += t.text
          else if (t.name === 'tab') text += '    '
          else if (t.name === 'br') {
            if (t.attrs.type === 'page') pageBreak = true
            else text += '\n'
          }
        }
        if (text) runs.push({ text, ...(style.bold && { bold: true }), ...(style.italic && { italic: true }) })
      } else if (c.name === 'hyperlink' || c.name === 'smartTag' || c.name === 'sdt' || c.name === 'sdtContent') visit(c)
    }
  }
  visit(p)
  return { runs, pageBreak }
}

/** Đọc DOCX thành các khối: tiêu đề (Heading1–3, Title), đoạn văn, danh sách (có đánh số hay không), bảng, ngắt trang. */
export function readDocx(bytes: Uint8Array): Block[] {
  const files = unzipOffice(bytes)
  const doc = readText(files, 'word/document.xml')
  if (!doc) throw new ToolError('invalid-office', 'word/document.xml is missing')
  const body = child(parseXml(doc), 'body')
  if (!body) throw new ToolError('invalid-office', 'Document has no body')

  // numId -> kiểu đánh số của cấp 0 (bullet hay decimal)
  const decimal = new Set<string>()
  const numbering = readText(files, 'word/numbering.xml')
  if (numbering) {
    const root = parseXml(numbering)
    const abstract = new Map<string, boolean>()
    for (const a of kids(root, 'abstractNum')) {
      const lvl0 = kids(a, 'lvl').find((l) => l.attrs.ilvl === '0')
      abstract.set(a.attrs.abstractNumId ?? '', ['decimal', 'lowerLetter', 'upperLetter', 'lowerRoman', 'upperRoman'].includes(child(lvl0, 'numFmt')?.attrs.val ?? ''))
    }
    for (const n of kids(root, 'num')) if (abstract.get(child(n, 'abstractNumId')?.attrs.val ?? '')) decimal.add(n.attrs.numId ?? '')
  }
  const counters = new Map<string, number>()

  const blocks: Block[] = []
  for (const el of body.children) {
    if (el.name === 'p') {
      const { runs, pageBreak } = runsOf(el)
      const style = path(el, 'pPr', 'pStyle')?.attrs.val ?? ''
      const heading = /^Heading([1-9])$/i.exec(style)
      const numPr = path(el, 'pPr', 'numPr')
      if (runs.length) {
        if (heading || /^Title$/i.test(style)) {
          blocks.push({ type: 'heading', level: heading ? (Math.min(3, Number(heading[1])) as 1 | 2 | 3) : 1, runs })
        } else if (numPr) {
          const numId = child(numPr, 'numId')?.attrs.val ?? ''
          const level = Number(child(numPr, 'ilvl')?.attrs.val ?? 0)
          let marker = '•'
          if (decimal.has(numId)) {
            const n = (counters.get(numId) ?? 0) + 1
            counters.set(numId, n)
            marker = `${n}.`
          }
          blocks.push({ type: 'list', marker, level, runs })
        } else blocks.push({ type: 'paragraph', runs })
      }
      if (pageBreak) blocks.push({ type: 'pageBreak' })
    } else if (el.name === 'tbl') {
      const rows = kids(el, 'tr').map((tr) =>
        kids(tr, 'tc').map((tc) => kids(tc, 'p').map((p) => runsOf(p).runs.map((r) => r.text).join('')).join('\n')),
      )
      if (rows.length) blocks.push({ type: 'table', rows })
    }
  }
  if (blocks.length === 0) throw new ToolError('invalid-office', 'Document has no content')
  return blocks
}
