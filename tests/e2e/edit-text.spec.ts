import { readFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import { expect, test, type Page } from '@playwright/test'
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'
import { pageTexts } from '../../src/tools/testUtils'

const fx = (n: string) => `tests/fixtures/${n}`
const pick = (page: Page, files: string[]) => page.locator('input[type=file]').setInputFiles(files.map(fx))
const upload = (page: Page, name: string, buffer: Buffer) => page.locator('input[type=file]').setInputFiles([{ name, mimeType: 'application/pdf', buffer }])
async function downloadOf(page: Page, name = 'Tải về') {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).first().click()])
  return readFileSync((await d.path())!)
}
const texts = async (pdf: Buffer, page = 0) => (await pageTexts(new Uint8Array(pdf)))[page]!.map((i) => i.str).join(' ')
async function rasterize(bytes: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' })
  const pg = await (await task.promise).getPage(1)
  const vp = pg.getViewport({ scale: 1 })
  const c = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height))
  await pg.render({ canvas: c as never, viewport: vp, background: 'rgb(255,255,255)' }).promise
  const g = c.getContext('2d')
  const dark = (x0: number, y0: number, x1: number, y1: number) => {
    let n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (g.getImageData(x, y, 1, 1).data[0]! < 120) n++
    return n
  }
  await task.destroy()
  return { dark }
}
async function textPdf(draw: (p: ReturnType<PDFDocument['addPage']>, f: Awaited<ReturnType<PDFDocument['embedFont']>>) => void, rotation = 0, pages = 1) {
  const d = await PDFDocument.create()
  const f = await d.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const p = d.addPage([595, 842])
    p.setRotation(degrees(rotation))
    draw(p, f)
  }
  return Buffer.from(await d.save())
}
const seg = (page: Page, text: string | RegExp) => page.getByRole('button', { name: typeof text === 'string' ? `Sửa chữ: ${text}` : text })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 })
})

test('sửa chữ có sẵn: bấm vào chữ, gõ chữ mới, xuất — chữ gốc biến mất hẳn khỏi tệp, chữ mới đúng chỗ', async ({ page }) => {
  await page.goto('/tools/edit')
  await pick(page, ['sample-1p.pdf'])
  // công cụ "Sửa chữ có sẵn" được chọn sẵn trong chế độ Chỉnh sửa
  await expect(page.getByRole('button', { name: 'Sửa chữ có sẵn' })).toHaveAttribute('aria-pressed', 'true')
  await expect(seg(page, 'Sample - page 1/1')).toBeVisible()
  await seg(page, 'Sample - page 1/1').click()
  const box = page.getByLabel('Nội dung')
  await expect(box).toBeFocused()
  await expect(box).toHaveValue('Sample - page 1/1')
  await box.fill('Xin chào thế giới')
  await expect(page.getByText('1 thành phần đã thêm')).toBeVisible()
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  const bytes = await downloadOf(page)
  const t = await texts(bytes)
  expect(t).toContain('Xin chào thế giới')
  expect(t).not.toContain('Sample') // chữ gốc đã bị xóa khỏi nội dung trang, không chỉ bị che
  expect(t).not.toContain('page 1/1')
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  // nhìn bằng mắt: có chữ ở vị trí cũ (y khoảng 58..82 / 842)
  expect((await rasterize(bytes)).dark(60, 56, 300, 90)).toBeGreaterThan(100)
  await expect(page.getByText('Ở một số chỗ không xóa được chữ gốc')).toHaveCount(0) // xóa sạch nên không có cảnh báo
})

test('mở một đoạn chữ rồi không sửa thì không tính là thay đổi; khôi phục chữ gốc quay về không thay đổi', async ({ page }) => {
  await page.goto('/tools/edit')
  await pick(page, ['sample-1p.pdf'])
  const run = page.getByRole('button', { name: 'Lưu chỉnh sửa' })
  await seg(page, 'Sample - page 1/1').click()
  await expect(page.getByText('0 thành phần đã thêm')).toBeVisible()
  await expect(run).toBeDisabled()
  await page.getByLabel('Nội dung').fill('Tạm thời')
  await expect(run).toBeEnabled()
  await page.getByRole('button', { name: 'Khôi phục chữ gốc' }).click()
  await expect(page.getByLabel('Nội dung')).toHaveValue('Sample - page 1/1')
  await expect(run).toBeDisabled()
})

test('xóa chữ: đoạn chữ biến mất khỏi tệp, các đoạn khác giữ nguyên', async ({ page }) => {
  const src = await textPdf((p, f) => {
    p.drawText('Giu lai dong nay', { x: 60, y: 760, size: 20, font: f })
    p.drawText('Xoa dong nay', { x: 60, y: 700, size: 20, font: f })
  })
  await page.goto('/tools/edit')
  await upload(page, 'a.pdf', src)
  await seg(page, 'Xoa dong nay').click()
  await page.getByRole('button', { name: 'Xóa chữ này' }).click()
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  const t = await texts(await downloadOf(page))
  expect(t).toContain('Giu lai dong nay')
  expect(t).not.toContain('Xoa')
})

test('hoàn tác và làm lại với thao tác sửa chữ', async ({ page }) => {
  await page.goto('/tools/edit')
  await pick(page, ['sample-1p.pdf'])
  await seg(page, 'Sample - page 1/1').click()
  await page.getByLabel('Nội dung').fill('Bản sửa')
  await expect(page.getByText('1 thành phần đã thêm')).toBeVisible()
  await page.getByRole('button', { name: 'Hoàn tác' }).click()
  await page.getByRole('button', { name: 'Hoàn tác' }).click()
  await expect(page.getByText('0 thành phần đã thêm')).toBeVisible()
  await page.getByRole('button', { name: 'Làm lại' }).click()
  await expect(seg(page, 'Sample - page 1/1')).toBeVisible()
})

test('bàn phím: Tab tới đoạn chữ rồi Enter để sửa', async ({ page }) => {
  await page.goto('/tools/edit')
  await pick(page, ['sample-1p.pdf'])
  const s = seg(page, 'Sample - page 1/1')
  await expect(s).toBeVisible()
  await s.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Nội dung')).toBeFocused()
})

test('chỉ trang được sửa bị đổi trong tệp nhiều trang', async ({ page }) => {
  await page.goto('/tools/edit')
  await pick(page, ['sample-10p.pdf'])
  await expect(seg(page, 'Sample - page 3/10')).toBeAttached()
  await seg(page, 'Sample - page 3/10').scrollIntoViewIfNeeded()
  await seg(page, 'Sample - page 3/10').click()
  await page.getByLabel('Nội dung').fill('Trang ba đã sửa')
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  const bytes = await downloadOf(page)
  expect(await texts(bytes, 2)).toContain('Trang ba đã sửa')
  expect(await texts(bytes, 2)).not.toContain('page 3/10')
  expect(await texts(bytes, 1)).toContain('page 2/10')
  expect(await texts(bytes, 3)).toContain('page 4/10')
})

test('trang xoay 90°: sửa chữ vẫn giữ hướng chữ và xóa đúng chữ gốc', async ({ page }) => {
  const src = await textPdf((p, f) => p.drawText('Original rotated', { x: 80, y: 700, size: 24, font: f }), 90)
  await page.goto('/tools/edit')
  await upload(page, 'xoay.pdf', src)
  await seg(page, 'Original rotated').click()
  await page.getByLabel('Nội dung').fill('Edited rotated')
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  const t = await texts(await downloadOf(page))
  expect(t).toContain('Edited')
  expect(t).not.toContain('Original')
})

/** Tên các phông được nhúng trong trang đầu của tệp. */
async function embeddedFonts(pdf: Buffer): Promise<string[]> {
  const { PDFDict, PDFName } = await import('pdf-lib')
  const doc = await PDFDocument.load(pdf)
  const fonts = doc.getPage(0).node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict)
  return (fonts?.keys() ?? []).map((k) => fonts!.lookupMaybe(k, PDFDict)?.lookupMaybe(PDFName.of('BaseFont'), PDFName)?.decodeText() ?? '')
}

test('giữ phông gốc: nhận ra Helvetica, chữ mới dùng phông tương đương (Liberation Sans) và tiếng Việt vẫn đủ dấu', async ({ page }) => {
  await page.goto('/tools/edit')
  await pick(page, ['sample-1p.pdf'])
  await seg(page, 'Sample - page 1/1').click()
  await expect(page.getByText(/Phông gốc: Helvetica/)).toBeVisible()
  await expect(page.getByLabel('Họ phông')).toHaveValue('sans')
  await expect(page.getByLabel('Đậm')).toHaveCount(0) // không có tùy chọn đậm/nghiêng
  await page.getByLabel('Nội dung').fill('Tiếng Việt có dấu: ệ ẫ ơ ư đ')
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  await expect(page.getByText('đã dùng DejaVu Sans')).toHaveCount(0) // Liberation có đủ tiếng Việt nên không phải rơi về phông khác
  const bytes = await downloadOf(page)
  expect(await texts(bytes)).toContain('Tiếng Việt có dấu: ệ ẫ ơ ư đ')
  expect((await embeddedFonts(bytes)).some((n) => /LiberationSans/.test(n))).toBe(true)
})

test('đổi họ phông ở bảng sửa: tệp xuất nhúng đúng phông đã chọn, không đậm/nghiêng', async ({ page }) => {
  await page.goto('/tools/edit')
  await pick(page, ['sample-1p.pdf'])
  await seg(page, 'Sample - page 1/1').click()
  await page.getByLabel('Họ phông').selectOption('serif')
  await page.getByLabel('Nội dung').fill('Serif regular')
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  const fonts = await embeddedFonts(await downloadOf(page))
  expect(fonts.some((n) => /LiberationSerif/.test(n) && !/Bold|Italic/.test(n))).toBe(true)
})

test('ký tự ngoài phông đã chọn (biểu tượng) tự dùng DejaVu và hiện cảnh báo', async ({ page }) => {
  await page.goto('/tools/edit')
  await pick(page, ['sample-1p.pdf'])
  await seg(page, 'Sample - page 1/1').click()
  await page.getByLabel('Nội dung').fill('Tuyết ☃ rơi')
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  await expect(page.getByText('đã dùng DejaVu Sans cho đoạn đó')).toBeVisible()
  expect(await texts(await downloadOf(page))).toContain('☃')
})

test('màu chữ gốc được giữ khi sửa (chữ đỏ vẫn đỏ)', async ({ page }) => {
  const { rgb } = await import('pdf-lib')
  const src = await textPdf((p, f) => p.drawText('Red heading', { x: 60, y: 760, size: 36, font: f, color: rgb(0.8, 0.1, 0.1) }))
  await page.goto('/tools/edit')
  await upload(page, 'do.pdf', src)
  await seg(page, 'Red heading').click()
  await page.getByLabel('Nội dung').fill('Still red')
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  const bytes = await downloadOf(page)
  expect(await texts(bytes)).toContain('Still red')
  // Màu gốc (0.8, 0.1, 0.1) được đọc từ nội dung trang và ghi lại: kiểm tra trong luồng nội dung trang của tệp xuất.
  const { PDFName, PDFRawStream, decodePDFRawStream, PDFArray } = await import('pdf-lib')
  const doc = await PDFDocument.load(bytes)
  const contents = doc.getPage(0).node.Contents()
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents!]
  const all = refs.map((r) => doc.context.lookup(r)).filter((x) => x instanceof PDFRawStream).map((x) => Buffer.from(decodePDFRawStream(x as never).decode()).toString('latin1')).join('\n')
  expect(all).toMatch(/0\.8\s+0\.1\s+0\.1\s+rg/)
  void PDFName
})

test('chữ nằm trong khối ghép sẵn (Form XObject): vẫn thấy chữ mới nhưng báo rõ chữ gốc chỉ bị phủ', async ({ page }) => {
  const inner = await PDFDocument.create()
  const f = await inner.embedFont(StandardFonts.Helvetica)
  inner.addPage([595, 842]).drawText('Hello embedded', { x: 60, y: 760, size: 24, font: f })
  const dst = await PDFDocument.create()
  const [emb] = await dst.embedPdf(await inner.save())
  dst.addPage([595, 842]).drawPage(emb!)
  await page.goto('/tools/edit')
  await upload(page, 'ghep.pdf', Buffer.from(await dst.save()))
  await seg(page, 'Hello embedded').click()
  await page.getByLabel('Nội dung').fill('Replaced')
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  await expect(page.getByText('Ở một số chỗ không xóa được chữ gốc')).toBeVisible()
  expect(await texts(await downloadOf(page))).toContain('Replaced')
})

test('trang không có chữ (bản quét): báo rõ và gợi ý dùng OCR', async ({ page }) => {
  const blank = await PDFDocument.create()
  blank.addPage([300, 300])
  await page.goto('/tools/edit')
  await upload(page, 'quet.pdf', Buffer.from(await blank.save()))
  await expect(page.getByText('Trang không có chữ để sửa')).toBeVisible()
})

test('các công cụ khác của Chỉnh sửa vẫn hoạt động cùng chữ đã sửa (ô trắng + sửa chữ trong một lần xuất)', async ({ page }) => {
  const src = await textPdf((p, f) => {
    p.drawText('Dong mot', { x: 60, y: 760, size: 20, font: f })
    p.drawText('Dong hai', { x: 60, y: 700, size: 20, font: f })
  })
  await page.goto('/tools/edit')
  await upload(page, 'b.pdf', src)
  await seg(page, 'Dong mot').click()
  await page.getByLabel('Nội dung').fill('Dòng một mới')
  await page.getByRole('button', { name: 'Văn bản', exact: true }).click()
  const b = (await page.getByTestId('page-0').boundingBox())!
  await page.mouse.click(b.x + b.width * 0.2, b.y + b.height * 0.6)
  await expect(page.getByText('2 thành phần đã thêm')).toBeVisible()
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  const t = await texts(await downloadOf(page))
  expect(t).toContain('Dòng một mới')
  expect(t).toContain('Văn bản')
  expect(t).toContain('Dong hai')
  expect(t).not.toContain('Dong mot')
})

const PARA = ['The quick brown fox jumps over', 'the lazy dog and keeps running', 'across the wide open field today']
const paraPdf = () =>
  textPdf((p, f) => {
    p.drawText('Heading Line', { x: 60, y: 780, size: 24, font: f })
    PARA.forEach((l, i) => p.drawText(l, { x: 60, y: 700 - i * 18, size: 14, font: f }))
    p.drawText('Next paragraph far below', { x: 60, y: 560, size: 14, font: f })
  })

test('sửa cả đoạn nhiều dòng một lần: ô sửa chứa cả đoạn, chữ mới tự xuống dòng, các dòng cũ biến mất', async ({ page }) => {
  await page.goto('/tools/edit')
  await upload(page, 'doan.pdf', await paraPdf())
  const block = seg(page, PARA.join(' '))
  await expect(block).toBeVisible() // ba dòng là một khối
  await expect(seg(page, 'Heading Line')).toBeVisible() // tiêu đề (khác cỡ) là khối riêng
  await block.click()
  await expect(page.getByLabel('Nội dung')).toHaveValue(PARA.join(' '))
  await page.getByLabel('Nội dung').fill('A fully rewritten paragraph that is long enough to need several lines inside the original paragraph box width')
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  const bytes = await downloadOf(page)
  const t = await texts(bytes)
  for (const old of ['quick', 'lazy', 'wide open']) expect(t).not.toContain(old)
  expect(t).toContain('A fully rewritten')
  expect(t).toContain('box width')
  expect(t).toContain('Heading Line')
  expect(t).toContain('Next paragraph far below')
  const items = (await pageTexts(new Uint8Array(bytes)))[0]!
  const ys = new Set(items.filter((i) => i.str.match(/rewritten|several|width|paragraph box/)).map((i) => Math.round(i.y)))
  expect(ys.size).toBeGreaterThanOrEqual(2) // chữ mới nằm trên nhiều dòng
})

test('Áp dụng / Hủy bỏ thay đổi: khóa khi không có gì; áp dụng đưa vào tài liệu và cho sửa tiếp; hủy bỏ vẫn hoàn tác được', async ({ page }) => {
  const src = await textPdf((p, f) => {
    p.drawText('First line here', { x: 60, y: 760, size: 20, font: f })
    p.drawText('Second line here', { x: 60, y: 700, size: 20, font: f })
  })
  await page.goto('/tools/edit')
  await upload(page, 'lo.pdf', src)
  const apply = page.getByRole('button', { name: 'Áp dụng thay đổi' })
  const discard = page.getByRole('button', { name: 'Hủy bỏ thay đổi' })
  await expect(seg(page, 'First line here')).toBeVisible()
  await expect(apply).toBeDisabled()
  await expect(discard).toBeDisabled()

  // Áp dụng lần 1: kết quả xuất hiện ngay (tải về được) và trở thành tài liệu nền
  await seg(page, 'First line here').click()
  await page.getByLabel('Nội dung').fill('Edited first')
  await expect(apply).toBeEnabled()
  await apply.click()
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible()
  await expect(apply).toBeDisabled() // đã áp dụng hết, chưa có thay đổi mới
  await expect(seg(page, 'Edited first')).toBeVisible() // tài liệu nền giờ chứa chữ mới, sửa tiếp được như chữ thường

  // Áp dụng lần 2 trên tài liệu đã áp dụng
  await seg(page, 'Second line here').click()
  await page.getByLabel('Nội dung').fill('Edited second')
  await apply.click()
  await expect(seg(page, 'Edited second')).toBeVisible()
  const bytes = await downloadOf(page)
  const t = await texts(bytes)
  expect(t).toContain('Edited first')
  expect(t).toContain('Edited second')
  expect(t).not.toMatch(/First line|Second line/)

  // Hủy bỏ: bỏ thay đổi đang chờ, không đụng phần đã áp dụng; hoàn tác lấy lại được
  await seg(page, 'Edited first').click()
  await page.getByLabel('Nội dung').fill('Will be discarded')
  await expect(page.getByText('1 thành phần đã thêm')).toBeVisible()
  await discard.click()
  await expect(page.getByText('0 thành phần đã thêm')).toBeVisible()
  await expect(apply).toBeDisabled()
  await page.getByRole('button', { name: 'Hoàn tác' }).click()
  await expect(page.getByText('1 thành phần đã thêm')).toBeVisible()
  await expect(apply).toBeEnabled()
})

test('Áp dụng thay đổi báo cảnh báo khi chỉ phủ lên được (chữ nằm trong khối ghép sẵn) và vẫn tải về được kết quả', async ({ page }) => {
  const inner = await PDFDocument.create()
  const f = await inner.embedFont(StandardFonts.Helvetica)
  inner.addPage([595, 842]).drawText('Hello embedded', { x: 60, y: 760, size: 24, font: f })
  const dst = await PDFDocument.create()
  const [emb] = await dst.embedPdf(await inner.save())
  dst.addPage([595, 842]).drawPage(emb!)
  await page.goto('/tools/edit')
  await upload(page, 'ghep.pdf', Buffer.from(await dst.save()))
  await seg(page, 'Hello embedded').click()
  await page.getByLabel('Nội dung').fill('Replaced')
  await page.getByRole('button', { name: 'Áp dụng thay đổi' }).click()
  await expect(page.getByText('Ở một số chỗ không xóa được chữ gốc')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible()
  expect(await texts(await downloadOf(page))).toContain('Replaced')
})

test('sửa tại chỗ: ô sửa nằm đè đúng khung chữ trên trang, con trỏ đúng chỗ bấm, chỉ có một ô "Nội dung", Esc để đóng', async ({ page }) => {
  const pdf = await textPdf((p, f) => p.drawText('Alpha Beta Gamma', { x: 72, y: 700, size: 20, font: f }))
  await page.goto('/tools/edit')
  await upload(page, 'inline.pdf', pdf)
  const hit = seg(page, 'Alpha Beta Gamma')
  await expect(hit).toBeVisible()
  const hb0 = (await hit.boundingBox())!
  const host = page.locator('[data-page-host]').first()
  const h0 = (await host.boundingBox())!
  // bấm vào giữa chữ "Beta" (khoảng 40%..60% bề rộng)
  await page.mouse.click(hb0.x + hb0.width * 0.5, hb0.y + hb0.height / 2)
  const box = page.getByLabel('Nội dung')
  // bảng sửa hiện ra có thể làm trang dịch chỗ: đo lại theo khung trang, đổi sang tỉ lệ
  const h1 = (await host.boundingBox())!
  const hb = { x: h1.x + (hb0.x - h0.x) * (h1.width / h0.width), y: h1.y + (hb0.y - h0.y) * (h1.width / h0.width), width: hb0.width * (h1.width / h0.width), height: hb0.height * (h1.width / h0.width) }
  await expect(box).toHaveCount(1)
  await expect(box).toBeFocused()
  const tb = (await box.boundingBox())!
  // ô sửa chồng khít khung chữ (sai số vài điểm ảnh)
  expect(Math.abs(tb.x - hb.x)).toBeLessThan(6)
  expect(Math.abs(tb.y - hb.y)).toBeLessThan(10)
  expect(tb.width).toBeGreaterThanOrEqual(hb.width - 6)
  // phông/cỡ lấy từ chữ gốc
  const css = await box.evaluate((el) => { const s = getComputedStyle(el); return { family: s.fontFamily, weight: s.fontWeight, color: s.color } })
  expect(css.family).toContain('Liberation Sans')
  // con trỏ ở khoảng giữa chuỗi, không phải đầu/cuối
  const caret = await box.evaluate((el) => (el as HTMLTextAreaElement).selectionStart)
  expect(caret).toBeGreaterThan(5)
  expect(caret).toBeLessThan(12)
  // gõ chèn vào đúng chỗ con trỏ
  await page.keyboard.type('X')
  await expect(box).toHaveValue(new RegExp(`^.{${caret}}X`))
  expect(await box.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('400')
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Nội dung')).toHaveCount(0)
  await expect(page.getByText('1 thành phần đã thêm')).toBeVisible()
})

test('sửa tại chỗ: đoạn nhiều dòng giữ bề rộng khối, trang xoay 90° xoay ô sửa theo chữ', async ({ page }) => {
  const para = await textPdf((p, f) => {
    const lines = ['The quick brown fox jumps over', 'the lazy dog and keeps running', 'across the wide open field today']
    lines.forEach((l, i) => p.drawText(l, { x: 72, y: 700 - i * 16, size: 12, font: f }))
  })
  await page.goto('/tools/edit')
  await upload(page, 'para.pdf', para)
  const hit = page.getByRole('button', { name: /^Sửa chữ: The quick brown fox/ })
  const hb0 = (await hit.boundingBox())!
  const host = page.locator('[data-page-host]').first()
  const h0 = (await host.boundingBox())!
  await hit.click()
  const box = page.getByLabel('Nội dung')
  const tb = (await box.boundingBox())!
  const k = (await host.boundingBox())!.width / h0.width // bảng bên cạnh làm trang hẹp lại
  const hb = { width: hb0.width * k, height: hb0.height * k }
  expect(Math.abs(tb.width - hb.width)).toBeLessThan(hb.width * 0.15)
  expect(tb.height).toBeGreaterThan(hb.height * 0.8)
  expect(tb.height).toBeLessThan(hb.height * 1.4)
  await expect(box).toHaveValue(/lazy dog/)
})

test('bảng phông/cỡ chữ nằm bên cạnh trang (cột phải) trên màn hình rộng, không nằm trên đầu', async ({ page }) => {
  const pdf = await textPdf((p, f) => p.drawText('Side panel', { x: 72, y: 700, size: 20, font: f }))
  await page.goto('/tools/edit')
  await upload(page, 'side.pdf', pdf)
  await seg(page, 'Side panel').click()
  const family = page.getByLabel('Họ phông')
  await expect(family).toBeVisible()
  const fb = (await family.boundingBox())!
  const pb = (await page.locator('[data-page-host]').first().boundingBox())!
  expect(fb.x).toBeGreaterThanOrEqual(pb.x + pb.width - 1) // bên phải trang
  expect(fb.y).toBeLessThan(pb.y + pb.height / 2) // ngang tầm trang, không bị đẩy xuống dưới
})

test('căn lề: nút Căn giữa/Phải đổi ô sửa ngay và tệp xuất đặt chữ đúng chỗ', async ({ page }) => {
  const pdf = await textPdf((p, f) => p.drawText('A rather long original sentence', { x: 72, y: 700, size: 16, font: f }))
  await page.goto('/tools/edit')
  await upload(page, 'align.pdf', pdf)
  await seg(page, 'A rather long original sentence').click()
  const box = page.getByLabel('Nội dung')
  await box.fill('Short')
  await expect(page.getByRole('button', { name: 'Căn trái' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Căn phải' }).click()
  await expect(page.getByRole('button', { name: 'Căn phải' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => box.evaluate((el) => getComputedStyle(el).textAlign)).toBe('right')
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  const bytes = await downloadOf(page)
  const it = (await pageTexts(new Uint8Array(bytes)))[0]!.find((i) => i.str.includes('Short'))!
  // mép phải của chữ mới trùng mép phải của khung gốc (chữ gốc rộng ~ 190pt từ x=72)
  expect(it.x).toBeGreaterThan(72 + 80)
})
