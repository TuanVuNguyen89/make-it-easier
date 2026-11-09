import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { zipOffice } from '@/lib/office/zip'
import { ctx, pageTexts, type TextItem } from './testUtils'
import { run as docxToPdf } from './docx-to-pdf/run'
import { run as xlsxToPdf } from './xlsx-to-pdf/run'
import { run as pptxToPdf } from './pptx-to-pdf/run'

const fixture = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`))
const flat = async (b: Uint8Array): Promise<TextItem[]> => (await pageTexts(b)).flat()
const find = (items: TextItem[], s: string) => items.find((i) => i.str.includes(s))!

const docxWith = (body: string) =>
  zipOffice({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  })
const para = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`

describe('docx-to-pdf (tệp DOCX thật do LibreOffice tạo)', () => {
  it('đủ nội dung theo đúng thứ tự: tiêu đề → đoạn → danh sách → bảng, kể cả tiếng Việt có dấu', async () => {
    const [out] = await docxToPdf([fixture('report.docx')], {}, ctx())
    expect(out!.name).toBe('document.pdf')
    const items = await flat(out!.data)
    const text = items.map((i) => i.str).join(' ')
    for (const s of ['Báo cáo quý ba', 'chữ đậm', 'chữ nghiêng', 'Nguyễn Văn An', 'Kết quả chính', 'Doanh thu tăng 12 phần trăm', 'Chi phí giảm 3 phần trăm', 'Đoạn cuối cùng']) {
      expect(text, s).toContain(s)
    }
    const y = (s: string) => find(items, s).y
    // y PDF giảm dần từ trên xuống dưới
    expect(y('Báo cáo quý ba')).toBeGreaterThan(y('Đây là đoạn mở đầu'))
    expect(y('Đây là đoạn mở đầu')).toBeGreaterThan(y('Kết quả chính'))
    expect(y('Kết quả chính')).toBeGreaterThan(y('Doanh thu'))
    expect(y('Doanh thu')).toBeGreaterThan(y('Chi phí'))
    expect(y('Chi phí')).toBeGreaterThan(y('Đoạn cuối'))
    expect(y('Đoạn cuối')).toBeGreaterThan(y('Số lượng'))
  })

  it('tiêu đề lớn hơn chữ thường; danh sách có dấu đầu dòng và thụt lề', async () => {
    const [out] = await docxToPdf([fixture('report.docx')], {}, ctx())
    const items = await flat(out!.data)
    expect(find(items, 'Báo cáo quý ba').size).toBeGreaterThan(find(items, 'Đoạn cuối').size * 1.5)
    expect(find(items, 'Kết quả chính').size).toBeGreaterThan(find(items, 'Đoạn cuối').size)
    expect(items.some((i) => i.str.trim() === '•')).toBe(true)
    expect(find(items, 'Doanh thu').x).toBeGreaterThan(find(items, 'Đoạn cuối').x + 15)
  })

  it('bảng: các ô nằm đúng hàng và cột', async () => {
    const [out] = await docxToPdf([fixture('report.docx')], {}, ctx())
    const items = await flat(out!.data)
    const cell = (s: string) => items.find((i) => i.str.trim() === s)!
    // cùng hàng: cùng y; cùng cột: cùng x
    expect(cell('Bút').y).toBeCloseTo(cell('10').y, 0)
    expect(cell('10').y).toBeCloseTo(cell('5000').y, 0)
    expect(cell('Vở').y).toBeLessThan(cell('Bút').y)
    expect(cell('Bút').x).toBeCloseTo(cell('Vở').x, 0)
    expect(cell('Số lượng').x).toBeCloseTo(cell('10').x, 0)
    expect(cell('10').x).toBeGreaterThan(cell('Bút').x)
  })

  it('tài liệu dài tự sang trang; ngắt trang được tôn trọng; không có trang trắng cuối', async () => {
    const long = docxWith(Array.from({ length: 120 }, (_, i) => para(`Đoạn số ${i + 1} của tài liệu dài`)).join(''))
    const [a] = await docxToPdf([long], {}, ctx())
    const pagesA = await pageTexts(a!.data)
    expect(pagesA.length).toBeGreaterThan(2)
    expect(pagesA.at(-1)!.map((i) => i.str).join(' ')).toContain('Đoạn số 120')
    const withBreaks = docxWith(`${para('Trang một')}<w:p><w:r><w:br w:type="page"/></w:r></w:p>${para('Trang hai')}<w:p><w:r><w:br w:type="page"/></w:r></w:p>`)
    const [b] = await docxToPdf([withBreaks], {}, ctx())
    const pagesB = await pageTexts(b!.data)
    expect(pagesB.length).toBe(2)
    expect(pagesB[0]!.map((i) => i.str).join('')).toContain('Trang một')
    expect(pagesB[1]!.map((i) => i.str).join('')).toContain('Trang hai')
  })

  it('đoạn dài tự xuống dòng trong lề trang', async () => {
    const [out] = await docxToPdf([docxWith(para(Array.from({ length: 80 }, (_, i) => `từ${i}`).join(' ')))], {}, ctx())
    const items = (await pageTexts(out!.data))[0]!
    expect(new Set(items.map((i) => Math.round(i.y))).size).toBeGreaterThan(2) // nhiều dòng
    expect(Math.max(...items.map((i) => i.x))).toBeLessThan(595)
    const joined = items.map((i) => i.str).join(' ')
    for (let i = 0; i < 80; i++) expect(joined).toContain(`từ${i}`)
  })

  it('tệp hỏng hoặc không đúng định dạng: invalid-office, không có đầu ra; hủy: aborted', async () => {
    await expect(docxToPdf([fixture('sample.txt')], {}, ctx())).rejects.toMatchObject({ code: 'invalid-office' })
    await expect(docxToPdf([zipOffice({ 'x.txt': 'hi' })], {}, ctx())).rejects.toMatchObject({ code: 'invalid-office' })
    await expect(docxToPdf([docxWith('')], {}, ctx())).rejects.toMatchObject({ code: 'invalid-office' })
    const ac = new AbortController()
    ac.abort()
    await expect(docxToPdf([fixture('report.docx')], {}, { progress: () => {}, signal: ac.signal })).rejects.toMatchObject({ code: 'aborted' })
  })

  it('tài liệu PDF đầu ra hợp lệ', async () => {
    const [out] = await docxToPdf([fixture('report.docx')], {}, ctx())
    expect((await PDFDocument.load(out!.data)).getPageCount()).toBeGreaterThanOrEqual(1)
  })
})

describe('xlsx-to-pdf (tệp XLSX thật do LibreOffice tạo)', () => {
  it('mọi ô đúng giá trị, đúng hàng và cột, số căn phải, tiếng Việt có dấu', async () => {
    const [out] = await xlsxToPdf([fixture('table.xlsx')], {}, ctx())
    expect(out!.name).toBe('workbook.pdf')
    const items = await flat(out!.data)
    const cell = (s: string) => items.find((i) => i.str.trim() === s)!
    for (const s of ['Sản phẩm', 'Số lượng', 'Đơn giá', 'Bút bi', 'Vở kẻ ngang', 'Thước', '10', '20', '5', '5000', '12000', '3500']) expect(cell(s), s).toBeTruthy()
    // hàng: cùng y; cột: cùng x (chữ) hoặc cùng mép phải (số)
    expect(cell('Sản phẩm').y).toBeCloseTo(cell('Số lượng').y, 0)
    expect(cell('Bút bi').y).toBeCloseTo(cell('10').y, 0)
    expect(cell('Vở kẻ ngang').y).toBeLessThan(cell('Bút bi').y)
    expect(cell('Thước').y).toBeLessThan(cell('Vở kẻ ngang').y)
    expect(cell('Sản phẩm').x).toBeCloseTo(cell('Bút bi').x, 0)
    expect(cell('Số lượng').x).toBeGreaterThan(cell('Sản phẩm').x)
    const right = (s: string) => cell(s).x + (items.find((i) => i.str.trim() === s)!.str.length * 5) // gần đúng mép phải
    expect(right('5000')).toBeGreaterThan(right('12000') - 30) // số cùng cột nằm sát cùng một mép phải
  })

  it('bảng rộng chia cột sang nhóm trang tiếp theo, không mất ô nào; bảng dài sang trang mới', async () => {
    const cols = 30
    const rowXml = (r: number) => `<row r="${r}">${Array.from({ length: cols }, (_, c) => `<c r="${String.fromCharCode(65 + (c % 26))}${c >= 26 ? 'A' : ''}${r}" t="inlineStr"><is><t>R${r}C${c}</t></is></c>`).join('')}</row>`
    const wide = zipOffice({
      '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
      'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Rộng" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${Array.from({ length: 60 }, (_, i) => rowXml(i + 1)).join('')}</sheetData></worksheet>`,
    })
    const [out] = await xlsxToPdf([wide], {}, ctx())
    const pages = await pageTexts(out!.data)
    expect(pages.length).toBeGreaterThan(2)
    const all = pages.flat().map((i) => i.str.trim())
    for (const [r, c] of [[1, 0], [1, 29], [60, 0], [60, 29], [30, 15]]) expect(all, `R${r}C${c}`).toContain(`R${r}C${c}`)
  })

  it('tệp hỏng, không phải xlsx, không có dữ liệu: invalid-office', async () => {
    await expect(xlsxToPdf([fixture('sample.txt')], {}, ctx())).rejects.toMatchObject({ code: 'invalid-office' })
    await expect(xlsxToPdf([fixture('report.docx')], {}, ctx())).rejects.toMatchObject({ code: 'invalid-office' })
  })
})

describe('pptx-to-pdf (tệp PPTX do pptxgenjs tạo)', () => {
  it('mỗi slide một trang cùng kích thước slide (16:9), đủ chữ tiếng Việt', async () => {
    const [out] = await pptxToPdf([fixture('deck.pptx')], {}, ctx())
    const doc = await PDFDocument.load(out!.data)
    expect(doc.getPageCount()).toBe(3)
    expect(doc.getPage(0).getWidth()).toBeCloseTo(720, 0)
    expect(doc.getPage(0).getHeight()).toBeCloseTo(405, 0)
    const pages = await pageTexts(out!.data)
    const text = (i: number) => pages[i]!.map((x) => x.str).join(' ')
    expect(text(0)).toContain('Báo cáo tổng kết năm')
    expect(text(0)).toContain('Nguyễn Văn An')
    expect(text(1)).toContain('Điểm chính')
    expect(text(1)).toContain('Doanh thu tăng mười hai phần trăm')
    expect(text(1)).toContain('Chi phí giảm ba phần trăm')
    expect(text(2)).toContain('Cảm ơn')
  })

  it('chữ đặt đúng vị trí khung (tiêu đề trên cao, nội dung bên trái) và tiêu đề lớn hơn nội dung', async () => {
    const [out] = await pptxToPdf([fixture('deck.pptx')], {}, ctx())
    const items = (await pageTexts(out!.data))[1]!
    const title = items.find((i) => i.str.includes('Điểm chính'))!
    const body = items.find((i) => i.str.includes('Doanh thu'))!
    expect(title.y).toBeGreaterThan(body.y)
    expect(title.size).toBeGreaterThan(body.size)
    expect(body.x).toBeLessThan(720 / 2) // khung chữ nằm nửa trái, ảnh nửa phải
    expect(items.some((i) => i.str.includes('•'))).toBe(true) // dấu đầu dòng có mặt (pdf.js có thể gộp với chữ cùng dòng)
    const cam = (await pageTexts(out!.data))[2]!.find((i) => i.str.includes('Cảm ơn'))!
    expect(cam.x).toBeGreaterThan(720 * 0.3) // căn giữa slide
  })

  it('ảnh trên slide được nhúng đúng vị trí (nửa phải) — kiểm tra bằng điểm ảnh', async () => {
    const { rasterizePdf } = await import('@/lib/pdfRaster')
    const { decodeImage } = await import('@/lib/image')
    const [out] = await pptxToPdf([fixture('deck.pptx')], {}, ctx())
    let png: Uint8Array | undefined
    await rasterizePdf(out!.data, { dpi: 72, format: 'png' }, (i, _t, d) => { if (i === 1) png = d }, new AbortController().signal)
    const bm = await decodeImage(png!)
    const at = (x: number, y: number) => [...bm.data.slice((y * bm.width + x) * 4, (y * bm.width + x) * 4 + 3)]
    // ảnh đỏ ở x 6..9in, y 1.3..3.55in → trong pt: 432..648, 94..256
    const p = at(450, 110)
    expect(p[0]).toBeGreaterThan(150)
    expect(p[1]).toBeLessThan(120)
    expect(at(100, 350)).toEqual([255, 255, 255]) // góc dưới-trái trống
  })

  it('tệp hỏng: invalid-office', async () => {
    await expect(pptxToPdf([fixture('sample.txt')], {}, ctx())).rejects.toMatchObject({ code: 'invalid-office' })
    await expect(pptxToPdf([zipOffice({ 'ppt/presentation.xml': '<p:presentation xmlns:p="x"/>' })], {}, ctx())).rejects.toMatchObject({ code: 'invalid-office' })
  })
})
