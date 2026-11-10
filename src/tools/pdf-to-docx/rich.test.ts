// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts, TextRenderingMode, popGraphicsState, pushGraphicsState, rgb, setTextRenderingMode, type PDFFont, type PDFPage } from 'pdf-lib'
import { strFromU8, unzipSync } from 'fflate'
import { ctx, pageTexts } from '../testUtils'
import { run } from './run'
import { encodePng } from '@/lib/pdfImages'

const SOFFICE = ['/usr/bin/soffice', '/usr/bin/libreoffice'].find(existsSync)
const H = 842

interface Kit {
  page: PDFPage
  f: PDFFont
  fb: PDFFont
  fi: PDFFont
  ft: PDFFont
  T: (s: string, x: number, yTop: number, size?: number, font?: PDFFont, color?: [number, number, number]) => void
  line: (x1: number, y1: number, x2: number, y2: number, w?: number) => void
}
async function makePdf(draw: (k: Kit, d: PDFDocument) => Promise<void> | void, pages = 1): Promise<Uint8Array> {
  const d = await PDFDocument.create()
  const f = await d.embedFont(StandardFonts.Helvetica)
  const fb = await d.embedFont(StandardFonts.HelveticaBold)
  const fi = await d.embedFont(StandardFonts.HelveticaOblique)
  const ft = await d.embedFont(StandardFonts.TimesRoman)
  for (let i = 0; i < pages; i++) {
    const page = d.addPage([595, H])
    await draw(
      {
        page, f, fb, fi, ft,
        T: (s, x, yTop, size = 10, font = f, color = [0, 0, 0]) => page.drawText(s, { x, y: H - yTop - size, size, font, color: rgb(...color) }),
        line: (x1, y1, x2, y2, w = 0.8) => page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: w }),
      },
      d,
    )
  }
  return d.save()
}
const convertDocx = async (pdf: Uint8Array) => {
  const [out] = await run([pdf], {}, ctx())
  const files = unzipSync(out!.data)
  return { data: out!.data, files, xml: strFromU8(files['word/document.xml']!), warnings: out!.warnings }
}
const paragraphs = (xml: string) => [...xml.matchAll(/<w:p>(.*?)<\/w:p>/g)].map((m) => m[1]!)
const textOf = (p: string) => [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>/g)].map((m) => (m[1] === undefined ? '\t' : m[1])).join('')
const para = (xml: string, text: string) => {
  const p = paragraphs(xml).find((x) => textOf(x).includes(text))
  if (!p) throw new Error(`Không thấy đoạn chứa "${text}"`)
  return p
}

describe('PDF → DOCX từ trang quét đã OCR (ảnh + chữ vô hình)', () => {
  /** Trang giống đầu ra của công cụ OCR: ảnh phủ vùng trang, lớp chữ vô hình (Tr 3) từng từ một, kích thước chữ lộn xộn theo từ. */
  /** Ảnh quét trắng (468×500 pt, 1 px = 1 pt) có các thanh đen đúng chỗ chữ OCR và (tùy chọn) một khối hình lớn. */
  function scanPng(withFigure: boolean) {
    const w = 468
    const h = 500
    const px = new Uint8Array(w * h * 3).fill(255)
    const bar = (x0: number, y0: number, bw: number, bh: number, rgb: [number, number, number]) => {
      for (let y = y0; y < Math.min(h, y0 + bh); y++) for (let x = x0; x < Math.min(w, x0 + bw); x++) px.set(rgb, (y * w + x) * 3)
    }
    // chữ: hai dòng (y trang 120 và 140) và dòng bullet (180, 230) trừ gốc ảnh (72, 72)
    for (const yTop of [120, 140, 180, 230]) bar(18, yTop - 72, 300, 9, [0, 0, 0])
    if (withFigure) bar(250, 280, 180, 150, [150, 60, 40])
    return encodePng(px, w, h, 3)
  }
  async function ocrPdf(withFigure = false) {
    return makePdf(async ({ page, f }, d) => {
      page.drawImage(await d.embedPng(scanPng(withFigure)), { x: 72, y: H - 72 - 500, width: 468, height: 500 })
      const words = ['Practical', 'Exam:', 'Internet', 'access', 'is', 'NOT', 'permitted', 'during', 'the', 'exam']
      let x = 90
      const lines = [[0, 1], [2, 3, 4, 5, 6, 7, 8, 9]]
      lines.forEach((idxs, li) => {
        x = 90
        for (const i of idxs) {
          const size = 10 + ((i * 7) % 5) * 0.4 // nhiễu cỡ chữ giữa các từ
          page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible))
          page.drawText(words[i]!, { x, y: H - (120 + li * 20) - size, size, font: f })
          page.pushOperators(popGraphicsState())
          x += f.widthOfTextAtSize(words[i]!, size) + 4
        }
      })
      // dấu đầu dòng bị OCR đọc thành "«"
      page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible))
      page.drawText('«', { x: 90, y: H - 180 - 10, size: 10, font: f })
      page.drawText('Bullet', { x: 106, y: H - 180 - 10, size: 10, font: f })
      page.pushOperators(popGraphicsState())
    })
  }

  it('trang quét có hình minh họa: ảnh quét bị bỏ nhưng hình được cắt ra giữ lại đúng chỗ', async () => {
    const r = await convertDocx(await ocrPdf(true))
    const media = Object.keys(r.files).filter((n) => n.startsWith('word/media/'))
    expect(media).toHaveLength(1) // chỉ hình, không phải cả trang quét
    const a = /<wp:anchor.*?<\/wp:anchor>/.exec(r.xml)![0]
    const num = (re: RegExp) => Number(re.exec(a)![1]) / 12700
    // hình ở (72 + 250, 72 + 280) kích thước ~180×150 pt (cho phép lệch vài điểm do lưới ô)
    expect(Math.abs(num(/<wp:positionH[^>]*><wp:posOffset>(\d+)/) - 322)).toBeLessThan(12)
    expect(Math.abs(num(/<wp:positionV[^>]*><wp:posOffset>(\d+)/) - 352)).toBeLessThan(12)
    expect(Math.abs(num(/<wp:extent cx="(\d+)"/) - 180)).toBeLessThan(20)
    expect(r.warnings).toContain('docx-scan-image-removed')
  })

  it('bỏ ảnh quét (không đè ảnh lên chữ), chữ OCR thành chữ thật cùng cỡ, có cảnh báo', async () => {
    const r = await convertDocx(await ocrPdf())
    expect(Object.keys(r.files).filter((n) => n.startsWith('word/media/'))).toEqual([])
    expect(r.xml).not.toContain('<wp:anchor')
    expect(r.warnings).toContain('docx-scan-image-removed')
    const p = para(r.xml, 'Practical')
    expect(textOf(p)).toBe('Practical Exam:')
    expect(para(r.xml, 'Internet')).toContain('Internet access is NOT permitted during the exam') // khoảng trắng đơn
    // cỡ chữ được làm đều trong thân bài dù cỡ từng từ lệch nhau
    const sizes = new Set([...r.xml.matchAll(/<w:r><w:rPr>.*?<w:sz w:val="(\d+)"\/>/g)].map((m) => m[1]))
    expect(sizes.size).toBe(1)
  })

  it('dấu đầu dòng bị OCR đọc thành ký hiệu lạ vẫn thành danh sách', async () => {
    const r = await convertDocx(await ocrPdf())
    const b = para(r.xml, 'Bullet')
    expect(b).toContain('<w:numPr>')
    expect(textOf(b)).toBe('Bullet')
  })

  it('trang OCR: khoảng trống do từ bị bỏ sót không thành tab, dòng căn đều sát mép phải không bị coi là căn phải, "o" đầu dòng là bullet con', async () => {
    const pdf = await makePdf(async ({ page, f }, d) => {
      page.drawImage(await d.embedPng(new Uint8Array(readFileSync('tests/fixtures/image-wide.png'))), { x: 72, y: H - 72 - 500, width: 468, height: 500 })
      const word = (t: string, x: number, yTop: number) => {
        page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible))
        page.drawText(t, { x, y: H - yTop - 10, size: 10, font: f })
        page.pushOperators(popGraphicsState())
      }
      // dòng có khoảng trống lớn ở giữa (từ bị bỏ sót), từ cuối sát mép phải
      word('Composition', 90, 100); word('such', 160, 100); word('as', 190, 100); word('or', 500, 100)
      // nhiều dòng thân bài để mép phải là 520
      for (let i = 0; i < 4; i++) { word('Filler', 90, 130 + i * 14); word('text', 130, 130 + i * 14); word('ending', 480, 130 + i * 14) }
      // dòng đơn kết thúc sát mép phải (cuối đoạn căn đều)
      word('Last', 300, 200); word('line', 330, 200); word('here', 495, 200)
      // bullet con "o"
      word('o', 110, 230); word('Nested', 124, 230); word('item', 160, 230)
    })
    const r = await convertDocx(pdf)
    const gapLine = para(r.xml, 'Composition')
    expect(gapLine).not.toContain('<w:tab/>')
    expect(textOf(gapLine)).toBe('Composition such as or')
    expect(para(r.xml, 'Last')).not.toContain('<w:jc w:val="right"/>')
    const nested = para(r.xml, 'Nested')
    expect(nested).toContain('<w:numPr>')
    expect(textOf(nested)).toBe('Nested item')
  })

  it('trang thường có ảnh và chữ nhìn thấy: ảnh được giữ (chỉ bỏ ảnh khi chữ là lớp OCR vô hình)', async () => {
    const pdf = await makePdf(async ({ page, T }, d) => {
      page.drawImage(await d.embedPng(new Uint8Array(readFileSync('tests/fixtures/image-wide.png'))), { x: 72, y: H - 72 - 300, width: 400, height: 300 })
      for (let i = 0; i < 5; i++) T(`Visible label number ${i} over the picture`, 90, 100 + i * 20)
    })
    const r = await convertDocx(pdf)
    expect(Object.keys(r.files).filter((n) => n.startsWith('word/media/'))).toHaveLength(1)
    expect(r.xml).toContain('<wp:anchor')
    expect(r.warnings).toBeUndefined()
  })
})

describe('PDF → DOCX: chú thích cạnh hình và khung bên', () => {
  /** Chữ chính ở trái (rộng dần xuống dưới) và chú thích hẹp ở phải, vùng chữ chính hẹp lại ở nửa trên vì có hình bên phải. */
  async function captionPdf() {
    return makePdf(({ T, ft, f }) => {
      const body = (y: number, text: string) => T(text, 50, y, 10.5, ft)
      for (let i = 0; i < 6; i++) body(60 + i * 14, `Main text line number ${i + 1} of the long left column here`)
      for (let i = 0; i < 4; i++) T(`Caption line ${i + 1} beside the picture`, 380, 80 + i * 11, 8.5, f)
      // dải dưới: chữ chính rộng hơn, chú thích thứ hai
      for (let i = 0; i < 5; i++) body(200 + i * 14, `Second band text line ${i + 1} which is a little longer than before`)
      for (let i = 0; i < 3; i++) T(`Second caption ${i + 1} text`, 430, 220 + i * 11, 8.5, f)
    })
  }

  it('chú thích cạnh hình thành khung chữ đặt tuyệt đối, chữ chính không bị trộn dòng với chú thích', async () => {
    const { xml } = await convertDocx(await captionPdf())
    const frames = paragraphs(xml).filter((p) => p.includes('<w:framePr '))
    expect(frames.map(textOf).join(' ')).toContain('Caption line 1')
    expect(frames.map(textOf).join(' ')).toContain('Second caption 3')
    const main = paragraphs(xml).filter((p) => !p.includes('<w:framePr ')).map(textOf).join(' ')
    expect(main).toContain('Main text line number 6')
    expect(main).toContain('Second band text line 5')
    expect(main).not.toContain('Caption')
    // vị trí khung là tọa độ trang (cột phải), tách riêng cho hai chú thích
    const xs = [...new Set(frames.map((p) => /w:x="(\d+)"/.exec(p)![1]))]
    expect(xs.sort()).toEqual([String(380 * 20), String(430 * 20)].sort())
    // chữ chính ngắt dòng trước vùng chú thích (thụt lề phải > 0), không tràn dưới hình
    const p = para(xml, 'Main text line number 1')
    expect(Number(/w:right="(\d+)"/.exec(p)![1])).toBeGreaterThan(0)
  })
})

describe('PDF → DOCX giữ định dạng', () => {
  it('chữ: phông, cỡ, màu, đậm, nghiêng, gạch chân trong cùng một đoạn', async () => {
    const pdf = await makePdf(({ T, f, fb, fi, ft, line }) => {
      T('Bold part ', 50, 100, 12, fb)
      T('italic part ', 50 + fb.widthOfTextAtSize('Bold part ', 12), 100, 12, fi)
      T('red serif', 50 + fb.widthOfTextAtSize('Bold part ', 12) + fi.widthOfTextAtSize('italic part ', 12), 100, 14, ft, [0.8, 0, 0])
      T('Underlined words', 50, 140, 11, f)
      line(50, 140 + 11 + 1.5, 50 + f.widthOfTextAtSize('Underlined words', 11), 140 + 11 + 1.5, 0.6)
    })
    const { xml } = await convertDocx(pdf)
    const p = para(xml, 'Bold part')
    expect(textOf(p)).toBe('Bold part italic part red serif')
    const runs = [...p.matchAll(/<w:r>(.*?)<\/w:r>/g)].map((m) => m[1]!)
    expect(runs).toHaveLength(3)
    expect(runs[0]).toContain('w:ascii="Arial"')
    expect(runs[0]).toContain('<w:b/>')
    expect(runs[0]).toContain('<w:sz w:val="24"/>')
    expect(runs[1]).toContain('<w:i/>')
    expect(runs[1]).not.toContain('<w:b/>')
    expect(runs[2]).toContain('w:ascii="Times New Roman"')
    expect(runs[2]).toContain('<w:color w:val="CC0000"/>')
    expect(runs[2]).toContain('<w:sz w:val="28"/>')
    expect(para(xml, 'Underlined')).toContain('<w:u w:val="single"/>')
  })

  it('căn lề: giữa, phải, trái và đoạn nhiều dòng; tab phải cho cột ngày', async () => {
    const pdf = await makePdf(({ T, f, fb }) => {
      T('Left aligned line that defines the left margin of the page', 50, 60, 10)
      T('A line of text that reaches the right edge of the content area ......', 50, 80, 10)
      const w = fb.widthOfTextAtSize('Centered Title', 18)
      T('Centered Title', (595 - w) / 2, 120, 18, fb)
      const rw = f.widthOfTextAtSize('Right side', 10)
      T('Right side', 545 - rw, 160, 10)
      T('Job title', 50, 200, 10, fb)
      const dw = f.widthOfTextAtSize('Oct 2025', 10)
      T('Oct 2025', 545 - dw, 200, 10)
    })
    const { xml } = await convertDocx(pdf)
    expect(para(xml, 'Centered Title')).toContain('<w:jc w:val="center"/>')
    expect(para(xml, 'Right side')).toContain('<w:jc w:val="right"/>')
    expect(para(xml, 'Left aligned')).not.toContain('<w:jc ')
    const row = para(xml, 'Job title')
    expect(textOf(row)).toBe('Job title\tOct 2025')
    expect(row).toMatch(/<w:tab w:val="right" w:pos="\d+"\/>/)
  })

  it('đoạn văn: dòng liền nhau gộp một đoạn, dòng ngắn là mục riêng, danh sách có thụt dòng treo', async () => {
    const pdf = await makePdf(({ T }) => {
      const lines = ['This paragraph is written across several lines of ordinary text so', 'that the converter has to join them into a single paragraph and', 'keep the words in order until the end of the paragraph here.']
      lines.forEach((l, i) => T(l, 50, 60 + i * 13, 10))
      T('Short item one', 50, 130, 10)
      T('Short item two', 50, 143, 10)
      T('•', 50, 180, 10)
      T('First bullet text', 62, 180, 10)
      T('•', 50, 195, 10)
      T('Second bullet text', 62, 195, 10)
    })
    const { xml } = await convertDocx(pdf)
    const ps = paragraphs(xml).map(textOf).filter(Boolean)
    expect(ps[0]).toBe('This paragraph is written across several lines of ordinary text so that the converter has to join them into a single paragraph and keep the words in order until the end of the paragraph here.')
    expect(ps.slice(1, 3)).toEqual(['Short item one', 'Short item two'])
    const b = para(xml, 'First bullet')
    expect(b).toContain('<w:numPr>')
    expect(b).toMatch(/<w:ind w:left="240" w:right="-?\d+" w:hanging="240"\/>/) // chữ cách dấu 12pt
  })

  it('danh sách đánh số giữ đúng số trong PDF (mục "4." sau đoạn xen giữa không bị đánh lại từ 1)', async () => {
    const pdf = await makePdf(({ T }) => {
      T('1. First step', 50, 60); T('2. Second step', 50, 74); T('3. Third step', 50, 88)
      T('A paragraph in between the two numbered sequences.', 50, 130)
      T('4. Fourth step continues', 50, 170); T('5. Fifth step', 50, 184)
    })
    const { xml, files } = await convertDocx(pdf)
    const num = strFromU8(files['word/numbering.xml']!)
    expect([...num.matchAll(/<w:startOverride w:val="(\d+)"\/>/g)].map((m) => m[1])).toEqual(['1', '4'])
    expect(xml.match(/<w:numId w:val="(\d+)"\/>/g)).toHaveLength(5)
  })

  it('bảng có đường kẻ: lưới thật, chữ đúng ô, ô gộp ngang và dọc, màu nền ô, viền', async () => {
    const pdf = await makePdf(({ page, T, line, fb }) => {
      const X = [50, 200, 350, 500]
      const Y = [100, 130, 160, 190]
      page.drawRectangle({ x: 50, y: H - 130, width: 450, height: 30, color: rgb(0.8, 0.9, 1) })
      for (const y of Y) line(50, y, 500, y)
      // hàng 1: ô gộp 2 cột đầu (bỏ đường dọc x=200 ở hàng 1); các hàng sau đủ đường dọc
      line(50, 100, 50, 190)
      line(350, 100, 350, 190)
      line(500, 100, 500, 190)
      line(200, 130, 200, 190)
      T('Merged heading across two columns', 56, 110, 10, fb)
      T('C', 356, 110, 10, fb)
      T('Alpha', 56, 140); T('Beta', 206, 140); T('Gamma', 356, 140)
      T('Delta', 56, 170); T('Epsilon', 206, 170); T('Zeta', 356, 170)
      void X
    })
    const { xml } = await convertDocx(pdf)
    expect(xml).toContain('<w:tbl>')
    expect(xml.match(/<w:gridCol /g)).toHaveLength(3)
    expect(xml.match(/<w:tr>/g)).toHaveLength(3)
    expect(xml).toContain('<w:gridSpan w:val="2"/>') // ô gộp ngang
    expect(xml).toContain('w:fill="CCE6FF"') // màu nền hàng tiêu đề
    expect(xml).toContain('<w:tblBorders>')
    const cells = [...xml.matchAll(/<w:tc>(.*?)<\/w:tc>/g)].map((m) => textOf(m[1]!))
    expect(cells).toEqual(['Merged heading across two columns', 'C', 'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'])
  })

  it('bảng không đường kẻ: cột chữ thẳng hàng thành bảng, cột số căn phải', async () => {
    const pdf = await makePdf(({ T, fb, f }) => {
      T('Name', 50, 100, 10, fb); T('Role', 200, 100, 10, fb); T('Score', 400, 100, 10, fb)
      const rows = [['An', 'Engineer', '92'], ['Binh', 'Designer', '88'], ['Chi', 'Manager', '95']]
      rows.forEach(([a, b, c], i) => {
        T(a!, 50, 120 + i * 18); T(b!, 200, 120 + i * 18)
        T(c!, 430 - f.widthOfTextAtSize(c!, 10), 120 + i * 18)
      })
    })
    const { xml } = await convertDocx(pdf)
    expect(xml).toContain('<w:tbl>')
    expect(xml).not.toContain('<w:tblBorders>')
    expect(xml.match(/<w:tr>/g)).toHaveLength(4)
    const cells = [...xml.matchAll(/<w:tc>(.*?)<\/w:tc>/g)].map((m) => textOf(m[1]!))
    expect(cells).toEqual(['Name', 'Role', 'Score', 'An', 'Engineer', '92', 'Binh', 'Designer', '88', 'Chi', 'Manager', '95'])
    expect(xml).toContain('<w:jc w:val="right"/>')
  })

  it('ảnh PNG và JPEG: nhúng vào gói, đặt đúng tọa độ và kích thước trên trang', async () => {
    const pdf = await makePdf(async ({ page, T }, d) => {
      T('Caption', 50, 40)
      page.drawImage(await d.embedPng(new Uint8Array(readFileSync('tests/fixtures/image-red.png'))), { x: 300, y: H - 100 - 60, width: 100, height: 60 })
      page.drawImage(await d.embedJpg(new Uint8Array(readFileSync('tests/fixtures/image-blue.jpg'))), { x: 50, y: H - 300 - 80, width: 120, height: 80 })
    })
    const r = await convertDocx(pdf)
    const media = Object.keys(r.files).filter((n) => n.startsWith('word/media/'))
    expect(media.map((n) => n.split('.').pop()).sort()).toEqual(['jpg', 'png'])
    // JPEG giữ nguyên byte; PNG hợp lệ
    const jpg = r.files[media.find((n) => n.endsWith('.jpg'))!]!
    expect([...jpg.slice(0, 2)]).toEqual([0xff, 0xd8])
    expect(jpg.length).toBe(readFileSync('tests/fixtures/image-blue.jpg').length)
    expect([...r.files[media.find((n) => n.endsWith('.png'))!]!.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    const anchors = [...r.xml.matchAll(/<wp:anchor.*?<\/wp:anchor>/g)].map((m) => m[0])
    expect(anchors).toHaveLength(2)
    const pos = (a: string) => ({
      x: Number(/<wp:positionH[^>]*><wp:posOffset>(\d+)/.exec(a)![1]) / 12700,
      y: Number(/<wp:positionV[^>]*><wp:posOffset>(\d+)/.exec(a)![1]) / 12700,
      w: Number(/<wp:extent cx="(\d+)"/.exec(a)![1]) / 12700,
      h: Number(/cy="(\d+)"/.exec(a)![1]) / 12700,
    })
    const sorted = anchors.map(pos).sort((a, b) => a.y - b.y)
    expect(sorted[0]).toMatchObject({ x: 300, y: 100, w: 100, h: 60 })
    expect(sorted[1]).toMatchObject({ x: 50, y: 300, w: 120, h: 80 })
    expect(r.xml).not.toMatch(/w:fill="FF0000"/)
    expect(r.warnings).toBeUndefined()
  })

  it('hai cột chữ: tách thành cột Word, đọc hết cột trái rồi cột phải', async () => {
    const pdf = await makePdf(({ T, ft }) => {
      for (let i = 0; i < 4; i++) T(`Left column line number ${i + 1} of text`, 50, 80 + i * 14, 10.5, ft)
      for (let i = 0; i < 4; i++) T(`Right column line number ${i + 1} of text`, 330, 80 + i * 14, 10.5, ft)
    })
    const { xml } = await convertDocx(pdf)
    expect(xml).toMatch(/<w:cols w:num="2" w:equalWidth="0"/)
    expect(xml).toContain('<w:br w:type="column"/>')
    const all = paragraphs(xml).map(textOf).join('|')
    expect(all.indexOf('Left column line number 4')).toBeLessThan(all.indexOf('Right column line number 1'))
  })

  it('đường kẻ ngang thành đoạn có viền dưới; mỗi trang một section đúng cỡ trang', async () => {
    const pdf = await makePdf(({ T, line }) => {
      T('Section title', 50, 60, 14)
      line(50, 82, 545, 82, 1)
      T('Body text under the rule', 50, 95)
    }, 2)
    const { xml } = await convertDocx(pdf)
    expect(xml).toMatch(/<w:pBdr><w:bottom w:val="single" w:sz="8"/)
    expect(xml.match(/<w:sectPr>/g)).toHaveLength(2)
    expect(xml).toContain('<w:pgSz w:w="11900" w:h="16840"/>')
  })

  it.skipIf(!SOFFICE)('mở bằng LibreOffice thật: vị trí chữ, cỡ chữ và số trang gần giống PDF gốc (bảng, đoạn, căn lề, ảnh)', async () => {
    const pdf = await makePdf(async ({ page, T, line, fb, f }, d) => {
      T('Quarterly Report', 50, 40, 24, fb, [0.1, 0.2, 0.6])
      T('Prepared for the board of directors', 50, 72, 11)
      const Y = [110, 135, 160, 185]
      for (const y of Y) line(50, y, 500, y)
      for (const x of [50, 200, 350, 500]) line(x, 110, x, 185)
      T('Item', 56, 117, 10, fb); T('Q1', 206, 117, 10, fb); T('Q2', 356, 117, 10, fb)
      T('Revenue', 56, 142); T('1,200', 206, 142); T('1,450', 356, 142)
      T('Costs', 56, 167); T('800', 206, 167); T('900', 356, 167)
      const cw = fb.widthOfTextAtSize('Centered note', 12)
      T('Centered note', (595 - cw) / 2, 220, 12, fb)
      T('Job title', 50, 250, 10, fb)
      T('Oct 2025', 545 - f.widthOfTextAtSize('Oct 2025', 10), 250)
      ;['This paragraph is written across several lines of ordinary text so', 'that the converter has to join them into a single paragraph and', 'keep the words in order until the end of the paragraph here.'].forEach((l, i) => T(l, 50, 290 + i * 13, 10))
      page.drawImage(await d.embedPng(new Uint8Array(readFileSync('tests/fixtures/image-red.png'))), { x: 50, y: H - 380 - 50, width: 90, height: 50 })
      T('After the picture', 50, 450, 10)
    })
    const dir = mkdtempSync(join(tmpdir(), 'mie-rich-'))
    const { data } = await convertDocx(pdf)
    const docx = join(dir, 'a.docx')
    writeFileSync(docx, data)
    execFileSync(SOFFICE!, ['-env:UserInstallation=file:///tmp/lo-profile-rich', '--headless', '--convert-to', 'pdf', '--outdir', dir, docx], { timeout: 120_000, stdio: 'pipe' })
    const back = new Uint8Array(readFileSync(join(dir, 'a.pdf')))
    const before = (await pageTexts(pdf))[0]!
    const after = (await pageTexts(back))
    expect(after).toHaveLength(1) // không tràn sang trang thứ hai
    const lo = after[0]!
    let compared = 0
    for (const it of before) {
      const s = it.str.trim()
      if (!s) continue
      const m = lo.find((o) => o.str.trim() === s || o.str.includes(s))
      if (!m) continue
      compared++
      expect(Math.abs(m.x - it.x), `x của "${s}"`).toBeLessThan(8)
      expect(Math.abs(m.y - it.y), `y của "${s}"`).toBeLessThan(10)
      if ('size' in it && 'size' in m) expect(Math.abs((m.size as number) - (it.size as number)), `cỡ của "${s}"`).toBeLessThan(0.6)
    }
    expect(compared).toBeGreaterThanOrEqual(12)
  }, 150_000)
})
