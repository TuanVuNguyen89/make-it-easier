import { ToolError } from '@/tools/types'
import { child, kids, parseXml, path, walk, type XNode } from './xml'
import { readText, resolvePath, unzipOffice } from './zip'

const EMU_PER_PT = 12700

export interface Para {
  text: string
  /** Cỡ chữ (điểm) nếu slide ghi rõ. */
  size?: number
  bold?: boolean
  bullet?: boolean
}
export interface TextShape {
  type: 'text'
  x: number
  y: number
  w: number
  h: number
  anchor: 't' | 'ctr' | 'b'
  title: boolean
  paras: Para[]
}
export interface PicShape {
  type: 'image'
  x: number
  y: number
  w: number
  h: number
  data: Uint8Array
}
export interface Slide {
  shapes: (TextShape | PicShape)[]
}
export interface Deck {
  width: number
  height: number
  slides: Slide[]
}

const num = (v: string | undefined) => (v === undefined ? NaN : Number(v))

function frame(spPr: XNode | undefined): { x: number; y: number; w: number; h: number } | null {
  const xf = child(spPr, 'xfrm')
  const off = child(xf, 'off')
  const ext = child(xf, 'ext')
  if (!off || !ext) return null
  const f = { x: num(off.attrs.x) / EMU_PER_PT, y: num(off.attrs.y) / EMU_PER_PT, w: num(ext.attrs.cx) / EMU_PER_PT, h: num(ext.attrs.cy) / EMU_PER_PT }
  return Object.values(f).every(Number.isFinite) && f.w > 0 && f.h > 0 ? f : null
}

function paragraphs(txBody: XNode | undefined): Para[] {
  const out: Para[] = []
  for (const p of kids(txBody, 'p')) {
    let text = ''
    let size: number | undefined
    let bold = false
    for (const r of p.children) {
      if (r.name === 'r' || r.name === 'fld') {
        const rPr = child(r, 'rPr')
        text += child(r, 't')?.text ?? ''
        if (rPr?.attrs.sz && size === undefined) size = Number(rPr.attrs.sz) / 100
        if (rPr?.attrs.b === '1') bold = true
      } else if (r.name === 'br') text += '\n'
    }
    const pPr = child(p, 'pPr')
    const bullet = !!child(pPr, 'buChar') || !!child(pPr, 'buAutoNum')
    if (text.trim()) out.push({ text, ...(size && { size }), ...(bold && { bold }), ...(bullet && { bullet }) })
  }
  return out
}

/** Đọc PPTX: kích thước slide, chữ (kèm vị trí), ảnh PNG/JPG (kèm vị trí) và bảng (thành chữ), theo thứ tự slide. */
export function readPptx(bytes: Uint8Array): Deck {
  const files = unzipOffice(bytes)
  const presXml = readText(files, 'ppt/presentation.xml')
  if (!presXml) throw new ToolError('invalid-office', 'ppt/presentation.xml is missing')
  const pres = parseXml(presXml)
  const sz = child(pres, 'sldSz')
  const width = num(sz?.attrs.cx) / EMU_PER_PT || 720
  const height = num(sz?.attrs.cy) / EMU_PER_PT || 405

  const relsXml = readText(files, 'ppt/_rels/presentation.xml.rels')
  const rels = new Map<string, string>()
  if (relsXml) for (const r of kids(parseXml(relsXml), 'Relationship')) rels.set(r.attrs.Id ?? '', r.attrs.Target ?? '')

  const slides: Slide[] = []
  for (const id of kids(child(pres, 'sldIdLst'), 'sldId')) {
    const target = rels.get(id.attrs.id ?? '')
    if (!target) continue
    const slidePath = resolvePath('ppt', target)
    const xml = readText(files, slidePath)
    if (!xml) continue
    const slideRels = new Map<string, string>()
    const dir = slidePath.slice(0, slidePath.lastIndexOf('/'))
    const rx = readText(files, `${dir}/_rels/${slidePath.slice(slidePath.lastIndexOf('/') + 1)}.rels`)
    if (rx) for (const r of kids(parseXml(rx), 'Relationship')) slideRels.set(r.attrs.Id ?? '', resolvePath(dir, r.attrs.Target ?? ''))

    const shapes: (TextShape | PicShape)[] = []
    const visit = (tree: XNode) => {
      for (const el of tree.children) {
        if (el.name === 'sp') {
          const paras = paragraphs(child(el, 'txBody'))
          if (!paras.length) continue
          const ph = path(el, 'nvSpPr', 'nvPr', 'ph')?.attrs.type ?? ''
          const f = frame(child(el, 'spPr'))
          const anchor = (child(child(el, 'txBody'), 'bodyPr')?.attrs.anchor ?? 't') as 't' | 'ctr' | 'b'
          shapes.push({ type: 'text', x: f?.x ?? NaN, y: f?.y ?? NaN, w: f?.w ?? NaN, h: f?.h ?? NaN, anchor: ['t', 'ctr', 'b'].includes(anchor) ? anchor : 't', title: /title/i.test(ph), paras })
        } else if (el.name === 'pic') {
          const embed = child(path(el, 'blipFill'), 'blip')?.attrs.embed
          const media = embed ? slideRels.get(embed) : undefined
          const data = media ? files[media] : undefined
          const f = frame(child(el, 'spPr'))
          if (data && f && /\.(png|jpe?g)$/i.test(media!)) shapes.push({ type: 'image', ...f, data })
        } else if (el.name === 'graphicFrame') {
          // Bảng: mỗi hàng thành một đoạn, ô cách nhau bằng " | ".
          const f = frame(el) // graphicFrame có xfrm ngay dưới nó
          const tbl = [...walk(el)].find((n) => n.name === 'tbl')
          if (tbl) {
            const paras: Para[] = kids(tbl, 'tr').map((tr) => ({ text: kids(tr, 'tc').map((tc) => paragraphs(child(tc, 'txBody')).map((p) => p.text).join(' ')).join('  |  ') })).filter((p) => p.text.replace(/[\s|]/g, ''))
            if (paras.length) shapes.push({ type: 'text', x: f?.x ?? NaN, y: f?.y ?? NaN, w: f?.w ?? NaN, h: f?.h ?? NaN, anchor: 't', title: false, paras })
          }
        } else if (el.name === 'grpSp') visit(el)
      }
    }
    visit(child(child(parseXml(xml), 'cSld'), 'spTree') ?? parseXml(xml))
    slides.push({ shapes })
  }
  if (slides.length === 0) throw new ToolError('invalid-office', 'Presentation has no slides')
  return { width, height, slides }
}
