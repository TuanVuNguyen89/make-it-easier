import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb } from 'pdf-lib'
import { strFromU8, unzipSync } from 'fflate'
import { readDocx } from '@/lib/office/docxRead'
import { readPptx } from '@/lib/office/pptxRead'
import { readXlsx } from '@/lib/office/xlsxRead'
import { ctx } from './testUtils'
import { run as toDocx } from './pdf-to-docx/run'
import { run as toXlsx } from './pdf-to-xlsx/run'
import { run as toPptx } from './pdf-to-pptx/run'

const fixture = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`))

/** PDF có chữ tiếng Việt (nhúng DejaVu); `draw` nhận hàm `text(page, str, x, yTop, size)` với yTop tính từ mép trên. */
async function makePdf(pages: ((text: (s: string, x: number, yTop: number, size: number) => void) => void)[]) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(new Uint8Array(readFileSync('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf')))
  for (const fill of pages) {
    const page = doc.addPage([595, 842])
    fill((s, x, yTop, size) => page.drawText(s, { x, y: 842 - yTop - size, size, font, color: rgb(0, 0, 0) }))
  }
  return doc.save()
}

const report = () =>
  makePdf([
    (t) => {
      t('Tiêu đề tài liệu', 60, 60, 26)
      t('Dòng đầu tiên của đoạn một', 60, 120, 12)
      t('tiếp tục dòng hai của đoạn một', 60, 136, 12)
      t('Đoạn hai riêng biệt.', 60, 190, 12)
      t('• Mục danh sách một', 60, 230, 12)
      t('• Mục danh sách hai', 60, 246, 12)
    },
    (t) => {
      t('Phần hai', 60, 60, 20)
      t('Nội dung của trang hai, Nguyễn Văn An.', 60, 110, 12)
    },
  ])

describe('pdf-to-docx', () => {
  it('dựng đúng cấu trúc: tiêu đề, đoạn gộp dòng, đoạn riêng, danh sách, ngắt trang, trang sau', async () => {
    const [out] = await toDocx([await report()], {}, ctx())
    expect(out!.name).toBe('document.docx')
    const xml = strFromU8(unzipSync(out!.data)['word/document.xml']!)
    const paras = [...xml.matchAll(/<w:p>(.*?)<\/w:p>/g)].map((m) => m[1]!)
    const textOf = (p: string) => [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')
    const withText = paras.filter((p) => textOf(p))
    expect(withText.map(textOf)).toEqual([
      'Tiêu đề tài liệu',
      'Dòng đầu tiên của đoạn một tiếp tục dòng hai của đoạn một', // hai dòng liền nhau gộp một đoạn
      'Đoạn hai riêng biệt.',
      'Mục danh sách một',
      'Mục danh sách hai',
      'Phần hai',
      expect.stringContaining('Nguyễn Văn An'),
    ])
    expect(withText[0]).toContain('<w:outlineLvl w:val="0"/>') // 26/12 là tiêu đề cấp 1
    expect(withText[0]).toContain('<w:sz w:val="52"/>') // giữ cỡ chữ gốc 26pt
    expect(withText[5]).toContain('<w:outlineLvl w:val="1"/>') // 20/12 nhỏ hơn: cấp 2
    expect(withText.filter((p) => p.includes('<w:numPr>'))).toHaveLength(2) // hai mục danh sách
    // mỗi trang PDF là một section: ngắt trang giữa hai trang, trang sau không bị gộp
    expect(xml.match(/<w:sectPr>/g)).toHaveLength(2)
  })

  it('danh sách thật: gạch đầu dòng và đánh số (mỗi danh sách đánh số lại từ 1)', async () => {
    const pdf = await makePdf([
      (t) => {
        t('1. Mục đầu', 60, 60, 12); t('2. Mục hai', 60, 76, 12)
        t('Một đoạn văn xen giữa hai danh sách.', 60, 130, 12)
        t('1. Danh sách thứ hai', 60, 180, 12)
      },
    ])
    const [out] = await toDocx([pdf], {}, ctx())
    const lists = readDocx(out!.data).filter((b) => b.type === 'list')
    expect(lists.map((b) => (b as { marker: string }).marker)).toEqual(['1.', '2.', '1.']) // danh sách thứ hai đánh số lại
    expect(Object.keys(unzipSync(out!.data))).toContain('word/numbering.xml')
  })

  it('tệp DOCX hợp lệ: có đủ phần bắt buộc của gói OOXML', async () => {
    const [out] = await toDocx([await report()], {}, ctx())
    const names = Object.keys(unzipSync(out!.data))
    for (const n of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml']) expect(names).toContain(n)
  })

  it('ký tự đặc biệt XML được thoát đúng', async () => {
    const pdf = await makePdf([(t) => t('Tom & Jerry <script> "q"', 60, 60, 12)])
    const [out] = await toDocx([pdf], {}, ctx())
    expect(readDocx(out!.data).map((b) => ('runs' in b ? b.runs[0]!.text : ''))).toEqual(['Tom & Jerry <script> "q"'])
  })

  it('PDF không có lớp chữ (trang trống): no-text-layer; PDF có mật khẩu: encrypted; hỏng: invalid-pdf', async () => {
    const blank = await PDFDocument.create()
    blank.addPage([300, 300])
    await expect(toDocx([await blank.save()], {}, ctx())).rejects.toMatchObject({ code: 'no-text-layer' })
    await expect(toDocx([fixture('encrypted-secret.pdf')], {}, ctx())).rejects.toMatchObject({ code: 'encrypted' })
    await expect(toDocx([fixture('corrupt.pdf')], {}, ctx())).rejects.toMatchObject({ code: 'invalid-pdf' })
  })
})

describe('pdf-to-xlsx', () => {
  const tablePdf = () =>
    makePdf([
      (t) => {
        t('Tên', 60, 80, 12); t('Số lượng', 260, 80, 12); t('Giá', 400, 80, 12)
        t('Bút bi', 60, 100, 12); t('10', 260, 100, 12); t('5000', 400, 100, 12)
        t('Vở kẻ ngang', 60, 120, 12); t('20', 260, 120, 12); t('12000', 400, 120, 12)
        t('Mã 007', 60, 140, 12); t('3', 260, 140, 12); t('3.5', 400, 140, 12)
      },
    ])

  it('bảng vẽ trên PDF thành lưới ô đúng hàng, đúng cột; số thành số, mã có 0 đầu giữ là chữ', async () => {
    const [out] = await toXlsx([await tablePdf()], {}, ctx())
    expect(out!.name).toBe('tables.xlsx')
    const sheets = readXlsx(out!.data)
    expect(sheets).toHaveLength(1)
    expect(sheets[0]!.name).toBe('Trang 1')
    expect(sheets[0]!.rows).toEqual([
      ['Tên', 'Số lượng', 'Giá'],
      ['Bút bi', 10, 5000],
      ['Vở kẻ ngang', 20, 12000],
      ['Mã 007', 3, 3.5],
    ])
  })

  it('mỗi trang có chữ một trang tính; trang trống bị bỏ qua', async () => {
    const pdf = await makePdf([(t) => t('A', 60, 80, 12), () => undefined, (t) => t('C', 60, 80, 12)])
    const [out] = await toXlsx([pdf], {}, ctx())
    expect(readXlsx(out!.data).map((s) => s.name)).toEqual(['Trang 1', 'Trang 3'])
  })

  it('PDF không có chữ: no-text-layer; có mật khẩu: encrypted', async () => {
    const blank = await PDFDocument.create()
    blank.addPage([300, 300])
    await expect(toXlsx([await blank.save()], {}, ctx())).rejects.toMatchObject({ code: 'no-text-layer' })
    await expect(toXlsx([fixture('encrypted-secret.pdf')], {}, ctx())).rejects.toMatchObject({ code: 'encrypted' })
  })

  it('XLSX do chính công cụ ghi có thể được công cụ xlsx đọc lại (vòng tròn không mất ô)', async () => {
    const [out] = await toXlsx([await tablePdf()], {}, ctx())
    const names = Object.keys(unzipSync(out!.data))
    for (const n of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']) expect(names).toContain(n)
  })
})

describe('pdf-to-pptx', () => {
  it('mỗi trang một slide có ảnh, kích thước slide theo trang, chữ trang nằm trong phần ghi chú', async () => {
    const [out] = await toPptx([await report()], {}, ctx())
    expect(out!.name).toBe('slides.pptx')
    const deck = readPptx(out!.data)
    expect(deck.slides).toHaveLength(2)
    expect(deck.width).toBeCloseTo(595, 0)
    expect(deck.height).toBeCloseTo(842, 0)
    for (const s of deck.slides) expect(s.shapes.filter((x) => x.type === 'image')).toHaveLength(1)
    const files = unzipSync(out!.data)
    const notes = Object.entries(files).filter(([n]) => /notesSlides\/notesSlide\d+\.xml$/.test(n)).map(([, v]) => strFromU8(v))
    expect(notes.length).toBe(2)
    expect(notes.join(' ')).toContain('Tiêu đề tài liệu')
    expect(notes.join(' ')).toContain('Phần hai')
  })

  it('ảnh slide là bản vẽ của trang (có điểm tối ở chỗ có chữ)', async () => {
    const { decodeImage } = await import('@/lib/image')
    const [out] = await toPptx([await report()], {}, ctx())
    const pic = readPptx(out!.data).slides[0]!.shapes.find((s) => s.type === 'image')!
    expect(pic.type).toBe('image')
    const bm = await decodeImage((pic as { data: Uint8Array }).data)
    expect(bm.width).toBeGreaterThan(1000) // 150 dpi
    let dark = 0
    for (let i = 0; i < bm.data.length; i += 4) if (bm.data[i]! < 90) dark++
    expect(dark).toBeGreaterThan(500)
  })

  it('PDF có mật khẩu: encrypted; hỏng: invalid-pdf; hủy: aborted', async () => {
    await expect(toPptx([fixture('encrypted-secret.pdf')], {}, ctx())).rejects.toMatchObject({ code: 'encrypted' })
    await expect(toPptx([fixture('corrupt.pdf')], {}, ctx())).rejects.toMatchObject({ code: 'invalid-pdf' })
    const ac = new AbortController()
    ac.abort()
    await expect(toPptx([await report()], {}, { progress: () => {}, signal: ac.signal })).rejects.toMatchObject({ code: 'aborted' })
  })
})
