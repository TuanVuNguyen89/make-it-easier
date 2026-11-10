import { escapeXml } from './xml'
import { zipOffice } from './zip'
import type { RichCell, RichElement, RichPage, RichParagraph, RichRun, RichTable } from './richModel'

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'

const tw = (pt: number) => Math.round(pt * 20)
const emu = (pt: number) => Math.round(pt * 12700)
const clampTw = (pt: number, max = 31000) => Math.max(0, Math.min(max, tw(pt)))

const runXml = (r: RichRun) => {
  const props =
    `<w:rFonts w:ascii="${escapeXml(r.font)}" w:hAnsi="${escapeXml(r.font)}" w:cs="${escapeXml(r.font)}" w:eastAsia="${escapeXml(r.font)}"/>` +
    (r.bold ? '<w:b/><w:bCs/>' : '') +
    (r.italic ? '<w:i/><w:iCs/>' : '') +
    (r.color !== '000000' ? `<w:color w:val="${r.color}"/>` : '') +
    `<w:sz w:val="${Math.max(2, Math.round(r.size * 2))}"/><w:szCs w:val="${Math.max(2, Math.round(r.size * 2))}"/>` +
    (r.underline ? '<w:u w:val="single"/>' : '')
  const body = r.text
    .split('\t')
    .map((seg, i) => `${i ? '<w:tab/>' : ''}${seg ? `<w:t xml:space="preserve">${escapeXml(seg)}</w:t>` : ''}`)
    .join('')
  return `<w:r><w:rPr>${props}</w:rPr>${body}</w:r>`
}

interface Numbering {
  /** numId của danh sách số đang chạy (để các mục liên tiếp đánh số tiếp nhau). */
  decimals: { numId: number; suffix: string; start: number }[]
  runningFor: string | null
  /** Số kế tiếp mà danh sách đang chạy mong đợi. */
  next: number
}

function paraXml(p: RichParagraph, num: Numbering, extraRuns = '', sect = ''): string {
  let numPr = ''
  if (p.list) {
    if (p.list.kind === 'bullet') {
      numPr = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
      num.runningFor = null
    } else {
      const start = p.list.start ?? num.next
      // Chuỗi mới khi đổi kiểu dấu hoặc số không nối tiếp (đánh số lại đúng số trong PDF, ví dụ "4." sau đoạn xen giữa).
      if (num.runningFor !== p.list.suffix || start !== num.next) {
        num.decimals.push({ numId: 3 + num.decimals.length, suffix: p.list.suffix, start })
        num.runningFor = p.list.suffix
      }
      num.next = start + 1
      numPr = `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${num.decimals.at(-1)!.numId}"/></w:numPr>`
    }
  } else num.runningFor = null
  const bdr = p.borderBottom ? `<w:pBdr><w:bottom w:val="single" w:sz="${Math.max(2, Math.min(96, Math.round(p.borderBottom.width * 8)))}" w:space="0" w:color="${p.borderBottom.color}"/></w:pBdr>` : ''
  const shd = p.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${p.shade}"/>` : ''
  const tabs = p.tabs.length ? `<w:tabs>${p.tabs.map((t) => `<w:tab w:val="${t.kind}" w:pos="${tw(t.pos)}"/>`).join('')}</w:tabs>` : ''
  const ind = `<w:ind w:left="${tw(p.indentLeft)}" w:right="${Math.round(p.indentRight * 20)}"${p.firstLine > 0 ? ` w:firstLine="${tw(p.firstLine)}"` : p.firstLine < 0 ? ` w:hanging="${tw(-p.firstLine)}"` : ''}/>`
  const lineRule = `<w:spacing w:before="${clampTw(p.before)}" w:after="0" w:line="${Math.max(20, clampTw(p.lineHeight))}" w:lineRule="exact"/>`
  const jc = p.align === 'left' ? '' : `<w:jc w:val="${p.align === 'center' ? 'center' : p.align === 'right' ? 'right' : 'both'}"/>`
  const outline = p.outline ? `<w:outlineLvl w:val="${p.outline - 1}"/>` : ''
  const mark = '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>'
  const frame = p.frame ? `<w:framePr w:w="${tw(p.frame.w)}" w:hRule="auto" w:hSpace="0" w:wrap="around" w:vAnchor="page" w:hAnchor="page" w:x="${tw(p.frame.x)}" w:y="${tw(p.frame.y)}"/>` : ''
  return `<w:p><w:pPr>${frame}<w:widowControl w:val="0"/>${numPr}${bdr}${shd}${tabs}${lineRule}${ind}${jc}${outline}${p.runs.length ? '' : mark}${sect}</w:pPr>${extraRuns}${p.runs.map(runXml).join('')}</w:p>`
}

const EMPTY_CELL_PARA = '<w:p><w:pPr><w:widowControl w:val="0"/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>'

function tableXml(t: RichTable, num: Numbering): string {
  const total = t.colWidths.reduce((a, b) => a + b, 0)
  const bd = t.border ? `w:val="single" w:sz="${Math.max(2, Math.min(48, Math.round(t.border.width * 8)))}" w:space="0" w:color="${t.border.color}"` : ''
  const borders = t.border ? `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} ${bd}/>`).join('')}</w:tblBorders>` : ''
  const cellXml = (c: RichCell) => {
    const merge = c.vMerge === 'restart' ? '<w:vMerge w:val="restart"/>' : c.vMerge === 'continue' ? '<w:vMerge/>' : ''
    const span = c.colSpan > 1 ? `<w:gridSpan w:val="${c.colSpan}"/>` : ''
    const shd = c.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.shade}"/>` : ''
    const paras = c.content.length ? c.content.map((p) => paraXml(p, num)).join('') : EMPTY_CELL_PARA
    return `<w:tc><w:tcPr><w:tcW w:w="${tw(c.width)}" w:type="dxa"/>${span}${merge}${shd}<w:vAlign w:val="top"/></w:tcPr>${paras}</w:tc>`
  }
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${tw(total)}" w:type="dxa"/><w:tblInd w:w="${tw(t.indent)}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/>` +
    '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
    `<w:tblGrid>${t.colWidths.map((w) => `<w:gridCol w:w="${tw(w)}"/>`).join('')}</w:tblGrid>` +
    t.rows.map((r) => `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${Math.max(20, tw(r.height))}" w:hRule="atLeast"/></w:trPr>${r.cells.map(cellXml).join('')}</w:tr>`).join('') +
    '</w:tbl>'
  )
}

const elementXml = (e: RichElement, num: Numbering) => (e.type === 'p' ? paraXml(e, num) : tableXml(e, num))

const levels = (fmt: string, text: string) =>
  `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>${fmt === 'bullet' ? '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:hint="default"/></w:rPr>' : ''}</w:lvl>`

const FONT_FAMILY = { sans: 'swiss', serif: 'roman', mono: 'modern' } as const
const FONT_ALT = { sans: 'Arial', serif: 'Times New Roman', mono: 'Courier New' } as const

/**
 * Ghi DOCX giữ định dạng từ các trang đã phân tích: mỗi trang PDF là một section (cùng cỡ trang và lề), chữ có phông/cỡ/màu,
 * đoạn có căn lề và khoảng cách, bảng thật, ảnh đặt đúng tọa độ trang.
 */
export function writeRichDocx(pages: RichPage[]): Uint8Array {
  const num: Numbering = { decimals: [], runningFor: null, next: 1 }
  const media = new Map<string, { name: string; ext: string; data: Uint8Array; rid: string }>()
  const fonts = new Map<string, 'sans' | 'serif' | 'mono'>()
  let docId = 1
  const collectFonts = (ps: RichParagraph[]) => ps.forEach((p) => p.runs.forEach((r) => fonts.set(r.font, r.family)))

  const anchorRun = (img: RichPage['images'][number]) => {
    let m = media.get(img.key)
    if (!m) {
      const n = media.size + 1
      m = { name: `image${n}.${img.ext === 'jpeg' ? 'jpg' : 'png'}`, ext: img.ext === 'jpeg' ? 'jpeg' : 'png', data: img.data, rid: `rId${100 + n}` }
      media.set(img.key, m)
    }
    const id = docId++
    return (
      `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${251650000 + id}" behindDoc="${img.behind ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1">` +
      `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${emu(img.x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${emu(img.y)}</wp:posOffset></wp:positionV>` +
      `<wp:extent cx="${emu(img.w)}" cy="${emu(img.h)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="Picture ${id}"/><wp:cNvGraphicFramePr/>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${m.name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${m.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(img.w)}" cy="${emu(img.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`
    )
  }

  const sectionXml = (page: RichPage) => {
    const m = page.margin
    const cols = page.columns
    let colsXml = ''
    if (cols.length > 1) {
      colsXml = `<w:cols w:num="${cols.length}" w:equalWidth="0" w:space="0">${cols.map((c, i) => `<w:col w:w="${tw(c.width)}" w:space="${i + 1 < cols.length ? tw(Math.max(0, cols[i + 1]!.x - (c.x + c.width))) : 0}"/>`).join('')}</w:cols>`
    }
    const land = page.width > page.height ? ' w:orient="landscape"' : ''
    return `<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${tw(page.width)}" w:h="${tw(page.height)}"${land}/><w:pgMar w:top="${tw(m.top)}" w:right="${tw(m.right)}" w:bottom="${tw(m.bottom)}" w:left="${tw(m.left)}" w:header="0" w:footer="0" w:gutter="0"/>${colsXml}</w:sectPr>`
  }

  const body: string[] = []
  pages.forEach((page, pi) => {
    // Đoạn đệm cao 1pt giữ các ảnh neo (tọa độ tuyệt đối theo trang); bù 1pt vào lề trên để không lệch chữ.
    const adj = page.images.length ? { ...page, margin: { ...page.margin, top: Math.max(0, page.margin.top - 1) } } : page
    if (page.images.length) body.push(paraXml({ type: 'p', runs: [], align: 'left', indentLeft: 0, indentRight: 0, firstLine: 0, before: 0, lineHeight: 1, tabs: [] }, num, page.images.map(anchorRun).join('')))
    page.columns.forEach((col, ci) => {
      for (const e of col.elements) {
        if (e.type === 'p') collectFonts([e])
        else e.rows.forEach((r) => r.cells.forEach((c) => collectFonts(c.content)))
        body.push(elementXml(e, num))
      }
      if (ci + 1 < page.columns.length) body.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr><w:r><w:br w:type="column"/></w:r></w:p>`)
    })
    const endPara = paraXml({ type: 'p', runs: [], align: 'left', indentLeft: 0, indentRight: 0, firstLine: 0, before: 0, lineHeight: 1, tabs: [] }, num, '', pi + 1 < pages.length ? sectionXml(adj) : '')
    body.push(endPara)
  })
  const last = pages.at(-1)!
  const lastAdj = last.images.length ? { ...last, margin: { ...last.margin, top: Math.max(0, last.margin.top - 1) } } : last

  const numbering =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${NS}>` +
    `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/>${levels('bullet', '•')}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/>${levels('decimal', '%1.')}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="singleLevel"/>${levels('decimal', '%1)')}</w:abstractNum>` +
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
    num.decimals.map((d) => `<w:num w:numId="${d.numId}"><w:abstractNumId w:val="${d.suffix === ')' ? 2 : 1}"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="${d.start}"/></w:lvlOverride></w:num>`).join('') +
    '</w:numbering>'

  const fontTable =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts ${NS}>` +
    [...fonts].map(([name, fam]) => `<w:font w:name="${escapeXml(name)}"><w:altName w:val="${FONT_ALT[fam]}"/><w:family w:val="${FONT_FAMILY[fam]}"/><w:pitch w:val="${fam === 'mono' ? 'fixed' : 'variable'}"/></w:font>`).join('') +
    '</w:fonts>'

  const mediaRels = [...media.values()].map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('')
  const entries: Record<string, string | Uint8Array> = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${mediaRels}</Relationships>`,
    'word/numbering.xml': numbering,
    'word/fontTable.xml': fontTable,
    'word/settings.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${NS}><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`,
    'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join('')}${sectionXml(lastAdj)}</w:body></w:document>`,
  }
  for (const m of media.values()) entries[`word/media/${m.name}`] = m.data
  return zipOffice(entries)
}
