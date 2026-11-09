import { type Block, type Run } from './blocks'
import { escapeXml } from './xml'
import { zipOffice } from './zip'

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

const runXml = (r: Run) =>
  `<w:r>${r.bold || r.italic ? `<w:rPr>${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(r.text)}</w:t></w:r>`

function blockXml(b: Block, listNum: number): string {
  switch (b.type) {
    case 'heading':
      return `<w:p><w:pPr><w:pStyle w:val="Heading${b.level}"/></w:pPr>${b.runs.map(runXml).join('')}</w:p>`
    case 'paragraph':
      return `<w:p>${b.runs.map(runXml).join('')}</w:p>`
    case 'list':
      return `<w:p><w:pPr><w:numPr><w:ilvl w:val="${Math.min(8, b.level)}"/><w:numId w:val="${listNum}"/></w:numPr></w:pPr>${b.runs.map(runXml).join('')}</w:p>`
    case 'table': {
      const cols = Math.max(...b.rows.map((r) => r.length))
      const border = (s: string) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`
      return (
        `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders></w:tblPr>` +
        `<w:tblGrid>${'<w:gridCol w:w="2400"/>'.repeat(cols)}</w:tblGrid>` +
        b.rows.map((r) => `<w:tr>${Array.from({ length: cols }, (_, i) => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${escapeXml(r[i] ?? '')}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('') +
        '</w:tbl><w:p/>'
      )
    }
    case 'pageBreak':
      return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
  }
}

const heading = (id: string, size: number) =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id.replace('Heading', 'heading ')}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${Number(id.slice(-1)) - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`

/** Ghi DOCX tối thiểu nhưng hợp lệ (Word, LibreOffice mở được): tiêu đề, đoạn, danh sách, bảng, ngắt trang. */
export function writeDocx(blocks: Block[]): Uint8Array {
  // Gán numId: gạch đầu dòng dùng numId 1; mỗi chuỗi mục đánh số liên tiếp dùng một numId mới (từ 2).
  const decimalNums: number[] = []
  let prevDecimal = false
  const body = blocks
    .map((b) => {
      let id = 1
      if (b.type === 'list' && /\d/.test(b.marker)) {
        if (!prevDecimal) decimalNums.push(2 + decimalNums.length)
        id = decimalNums.at(-1)!
        prevDecimal = true
      } else prevDecimal = false
      return blockXml(b, id)
    })
    .join('')
  const levels = (fmt: string, text: (l: number) => string) =>
    Array.from({ length: 9 }, (_, l) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text(l)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + l * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join('')
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels('bullet', () => '•')}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels('decimal', (l) => `%${l + 1}.`)}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${decimalNums.map((n) => `<w:num w:numId="${n}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('')}</w:numbering>`
  return zipOffice({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>',
    'word/numbering.xml': numbering,
    'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${heading('Heading1', 44)}${heading('Heading2', 34)}${heading('Heading3', 28)}</w:styles>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  })
}
