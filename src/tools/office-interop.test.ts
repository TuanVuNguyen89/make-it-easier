// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import fontkit from '@pdf-lib/fontkit'
import { strFromU8, unzipSync } from 'fflate'
import { PDFDocument, rgb } from 'pdf-lib'
import { applyAnnotationsDetailed, type Annotation } from '@/lib/annotations'
import { extractPdfText } from '@/lib/pdfText'
import { extractTextStyles, styleForParts, toHex } from '@/lib/pdfFontStyle'
import { buildBlocks, type Block } from '@/lib/textSegments'
import { ctx, pageTexts } from './testUtils'
import { run as toDocx } from './pdf-to-docx/run'
import { run as toXlsx } from './pdf-to-xlsx/run'
import { run as toPptx } from './pdf-to-pptx/run'

const SOFFICE = ['/usr/bin/soffice', '/usr/bin/libreoffice'].find(existsSync)

/** Nhờ LibreOffice thật mở và chuyển tệp sang `to`; trả về đường dẫn tệp kết quả. Dùng hồ sơ riêng để không đụng bản đang chạy. */
function convert(file: string, to: string, dir: string): string {
  execFileSync(SOFFICE!, ['-env:UserInstallation=file:///tmp/lo-profile-vitest', '--headless', '--convert-to', to, '--outdir', dir, file], { timeout: 120_000, stdio: 'pipe' })
  return join(dir, `${file.split('/').pop()!.replace(/\.[^.]+$/, '')}.${to.split(':')[0]}`)
}

async function makePdf(pages: ((t: (s: string, x: number, yTop: number, size: number) => void) => void)[]) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(new Uint8Array(readFileSync('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf')))
  for (const fill of pages) {
    const page = doc.addPage([595, 842])
    fill((s, x, yTop, size) => page.drawText(s, { x, y: 842 - yTop - size, size, font, color: rgb(0, 0, 0) }))
  }
  return doc.save()
}

describe.skipIf(!SOFFICE)('tệp xuất ra mở được bằng LibreOffice thật', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mie-office-'))

  it('PDF → DOCX: LibreOffice mở và in lại đúng tiêu đề, đoạn, danh sách và tiếng Việt', async () => {
    const pdf = await makePdf([
      (t) => {
        t('Báo cáo thử nghiệm', 60, 60, 26)
        t('Đoạn mở đầu với Nguyễn Văn An.', 60, 120, 12)
        t('• Mục một', 60, 170, 12)
        t('• Mục hai', 60, 186, 12)
      },
      (t) => t('Trang hai có nội dung', 60, 60, 12),
    ])
    const [out] = await toDocx([pdf], {}, ctx())
    const docx = join(dir, 'a.docx')
    writeFileSync(docx, out!.data)
    const back = new Uint8Array(readFileSync(convert(docx, 'pdf', dir)))
    const pages = await pageTexts(back)
    expect(pages.length).toBe(2) // ngắt trang được LibreOffice tôn trọng
    const text = pages.map((p) => p.map((i) => i.str).join(' ')).join(' | ')
    for (const s of ['Báo cáo thử nghiệm', 'Đoạn mở đầu với Nguyễn Văn An.', 'một', 'hai', 'Trang hai có nội dung']) expect(text, s).toContain(s)
    // Chữ trong tệp DOCX còn nguyên (LibreOffice tách dấu của "ụ" khi nhúng phông DejaVu nên không so chữ này ở bản in lại).
    expect(strFromU8(unzipSync(out!.data)['word/document.xml']!)).toContain('Mục một')
    // tiêu đề giữ cỡ chữ gốc (26 so với 12) trong bản LibreOffice in ra
    const heading = pages[0]!.find((i) => i.str.includes('Báo cáo thử nghiệm'))!
    const body = pages[0]!.find((i) => i.str.includes('Đoạn mở đầu'))!
    expect(heading.size).toBeGreaterThan(body.size * 1.4)
  }, 150_000)

  it('PDF → XLSX: LibreOffice đọc ra đúng bảng (xuất CSV để so sánh)', async () => {
    const pdf = await makePdf([
      (t) => {
        t('Tên', 60, 80, 12); t('Số lượng', 260, 80, 12); t('Giá', 400, 80, 12)
        t('Bút bi', 60, 100, 12); t('10', 260, 100, 12); t('5000', 400, 100, 12)
        t('Vở kẻ ngang', 60, 120, 12); t('20', 260, 120, 12); t('12000', 400, 120, 12)
      },
    ])
    const [out] = await toXlsx([pdf], {}, ctx())
    const xlsx = join(dir, 'b.xlsx')
    writeFileSync(xlsx, out!.data)
    const csv = readFileSync(convert(xlsx, 'csv:Text - txt - csv (StarCalc):44,34,76,1', dir), 'utf8').trim().split(/\r?\n/)
    // CSV của LibreOffice: ô chữ trong ngoặc kép, ô số không có ngoặc => nhận đúng kiểu dữ liệu của từng ô.
    expect(csv).toEqual(['"Tên","Số lượng","Giá"', '"Bút bi",10,5000', '"Vở kẻ ngang",20,12000'])
  }, 150_000)

  it('PDF → PPTX: LibreOffice mở và in ra đúng số slide', async () => {
    const pdf = await makePdf([(t) => t('Slide một', 60, 60, 20), (t) => t('Slide hai', 60, 60, 20), (t) => t('Slide ba', 60, 60, 20)])
    const [out] = await toPptx([pdf], {}, ctx())
    const pptx = join(dir, 'c.pptx')
    writeFileSync(pptx, out!.data)
    const back = new Uint8Array(readFileSync(convert(pptx, 'pdf', dir)))
    expect((await PDFDocument.load(back)).getPageCount()).toBe(3)
  }, 150_000)

  it('sửa chữ trên PDF thật do LibreOffice tạo (mảng TJ, chuỗi hex, nhóm nội dung đánh dấu): chữ gốc biến mất, phần còn lại nguyên vẹn', async () => {
    const pdfPath = convert(join(process.cwd(), 'tests/fixtures/report.docx'), 'pdf', dir)
    const pdf = new Uint8Array(readFileSync(pdfPath))
    const signal = new AbortController().signal
    const segs = buildBlocks((await extractPdfText(pdf, signal))[0]!)
    const bySub = (s: string) => segs.find((x) => x.text.includes(s))!
    const heading = bySub('Báo cáo quý ba')
    const para = bySub('Đoạn cuối cùng')
    expect(heading).toBeTruthy()
    expect(para).toBeTruthy()

    const mk = (seg: Block, text: string, id: string): Annotation => ({
      id, page: 0, type: 'textEdit', x: seg.x, baseline: seg.baseline, angle: seg.angle, w: seg.w, h: seg.h, lines: seg.lines, lineHeight: seg.lineHeight, original: seg.text, text, size: seg.size, color: '#000000', family: 'serif', bold: false, italic: false, parts: seg.parts,
    })
    const { bytes, warnings } = await applyAnnotationsDetailed(pdf, [mk(heading, 'Tiêu đề đã sửa', 'h'), mk(para, 'Dòng cuối đã thay', 'p')], signal, () => {})
    expect(warnings).toEqual([])

    const after = (await pageTexts(bytes))[0]!.map((i) => i.str).join(' ')
    expect(after).toContain('Tiêu đề đã sửa')
    expect(after).toContain('Dòng cuối đã thay')
    expect(after).not.toContain('Báo cáo quý ba') // chữ gốc đã bị xóa khỏi tầng nội dung của PDF do LibreOffice tạo
    expect(after).not.toContain('Đoạn cuối cùng')
    // mọi đoạn chữ khác giữ nguyên
    const others = segs.filter((s) => s !== heading && s !== para)
    expect(others.length).toBeGreaterThan(3)
    const squash = (x: string) => x.replace(/\s+/g, '')
    for (const o of others) expect(squash(after), o.text).toContain(squash(o.text))
    // tệp kết quả vẫn mở được bằng LibreOffice thật
    const out = join(dir, 'edited.pdf')
    writeFileSync(out, bytes)
    const back = new Uint8Array(readFileSync(convert(out, 'png', dir)))
    expect(back[0]).toBe(0x89) // LibreOffice vẽ được trang đã sửa ra ảnh PNG
  }, 150_000)

  it('sửa cả đoạn nhiều dòng trên PDF thật do LibreOffice dàn trang: gom đúng thành một khối, xóa mọi dòng cũ, đoạn khác nguyên vẹn', async () => {
    const long = 'Đây là một đoạn văn dài được viết ra để chắc chắn trình soạn thảo phải ngắt thành nhiều dòng trên trang giấy khổ A4. '.repeat(4)
    const html = join(dir, 'long.html')
    writeFileSync(html, `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>Tiêu đề thử</h1><p>${long}</p><p>Đoạn thứ hai ngắn gọn nằm riêng biệt.</p></body></html>`)
    const pdfPath = convert(html, 'pdf', dir)
    const pdf = new Uint8Array(readFileSync(pdfPath))
    const signal = new AbortController().signal
    const blocks = buildBlocks((await extractPdfText(pdf, signal))[0]!)
    const para = blocks.find((b) => b.text.includes('Đây là một đoạn văn dài'))!
    expect(para, blocks.map((b) => b.text.slice(0, 30)).join(' | ')).toBeTruthy()
    expect(para.lines).toBeGreaterThanOrEqual(3) // LibreOffice ngắt thành nhiều dòng, ta gom lại một khối
    expect(para.parts.length).toBe(para.lines)
    expect(blocks.some((b) => b.text.includes('Tiêu đề thử') && !b.text.includes('Đây là'))).toBe(true) // tiêu đề là khối riêng
    expect(blocks.some((b) => b.text.includes('Đoạn thứ hai ngắn gọn'))).toBe(true)

    const edit: Annotation = {
      id: 'x', page: 0, type: 'textEdit', x: para.x, baseline: para.baseline, angle: para.angle, w: para.w, h: para.h, lines: para.lines, lineHeight: para.lineHeight,
      original: para.text, text: 'Đoạn mới đã được viết lại hoàn toàn và tự xuống dòng bên trong khung của đoạn gốc một cách gọn gàng.', size: para.size, color: '#000000', family: 'serif', bold: false, italic: false, parts: para.parts,
    }
    const { bytes, warnings } = await applyAnnotationsDetailed(pdf, [edit], signal, () => {})
    expect(warnings).toEqual([])
    const after = (await pageTexts(bytes))[0]!.map((i) => i.str).join(' ').replace(/\s+/g, '')
    expect(after).toContain('Đoạnmớiđãđượcviếtlạihoàntoàn')
    expect(after).not.toContain('Đâylàmộtđoạnvănd') // mọi dòng của đoạn cũ đã bị xóa
    expect(after).toContain('Tiêuđềthử')
    expect(after).toContain('Đoạnthứhaingắngọnnằmriêngbiệt.')
  }, 150_000)

  it('giữ phông thật của PDF LibreOffice: nhận ra LiberationSerif-Bold, chữ mới đậm/có chân và rộng thêm đúng bằng một dấu chấm', async () => {
    const pdfPath = convert(join(process.cwd(), 'tests/fixtures/report.docx'), 'pdf', dir)
    const pdf = new Uint8Array(readFileSync(pdfPath))
    const signal = new AbortController().signal
    const blocks = buildBlocks((await extractPdfText(pdf, signal))[0]!)
    const heading = blocks.find((b) => b.text.includes('Báo cáo quý ba'))!
    const styles = await extractTextStyles(pdf)
    const st = styleForParts(styles[0]!, heading.parts, heading.angle)
    expect(st.font).toMatchObject({ name: 'LiberationSerif-Bold', family: 'serif', bold: true, italic: false })
    expect(st.fill).toEqual([0, 0, 0])

    const lineWidth = async (bytes: Uint8Array, needle: string) => {
      const items = (await pageTexts(bytes))[0]!
      const first = items.find((i) => i.str.includes(needle))!
      const line = items.filter((i) => Math.abs(i.y - first.y) < 1)
      return Math.max(...line.map((i) => i.x + i.width)) - Math.min(...line.map((i) => i.x))
    }
    const before = await lineWidth(pdf, 'Báo cáo')
    const edit: Annotation = {
      id: 'x', page: 0, type: 'textEdit', x: heading.x, baseline: heading.baseline, angle: heading.angle, w: heading.w, h: heading.h, lines: 1, lineHeight: heading.lineHeight,
      original: heading.text, text: `${heading.text}.`, size: heading.size, color: toHex(st.fill!), family: st.font!.family, bold: st.font!.bold, italic: st.font!.italic, parts: heading.parts,
    }
    const { bytes, warnings } = await applyAnnotationsDetailed(pdf, [edit], signal, () => {})
    expect(warnings).toEqual([])
    const after = await lineWidth(bytes, 'Báo cáo')
    // Cùng họ phông Liberation Serif Bold với phông gốc: thêm một dấu chấm thì rộng thêm đúng bề rộng dấu chấm (0,25 em của Times).
    expect(Math.abs(after - before - 0.25 * heading.size)).toBeLessThan(0.8)
  }, 150_000)
})
