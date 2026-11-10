import { readFileSync } from 'node:fs'
import { GlobalFonts, createCanvas } from '@napi-rs/canvas'
import { expect, test, type Page } from '@playwright/test'
import { PDFDocument, PDFName } from 'pdf-lib'
import { pageTexts } from '../../src/tools/testUtils'

GlobalFonts.registerFromPath('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf', 'DejaVu Sans')

function textPng(lines: string[]) {
  const c = createCanvas(1000, 60 + lines.length * 96)
  const g = c.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#000'
  g.font = '56px "DejaVu Sans"'
  g.textBaseline = 'top'
  lines.forEach((l, i) => g.fillText(l, 40, 40 + i * 96))
  return { name: 'chup.png', mimeType: 'image/png', buffer: c.toBuffer('image/png') }
}
async function downloadOf(page: Page, name = 'Tải về') {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).first().click()])
  return readFileSync((await d.path())!)
}

test('OCR ảnh chụp tiếng Việt trong trình duyệt: ra PDF có chữ chọn được', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/tools/ocr')
  await page.locator('input[type=file]').setInputFiles([textPng(['Xin chào Việt Nam', 'Hóa đơn 2024'])])
  await page.getByLabel('Ngôn ngữ trong tài liệu').selectOption('vie')
  await page.getByRole('button', { name: 'Nhận dạng chữ', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible({ timeout: 90_000 })
  const bytes = await downloadOf(page)
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  const text = (await pageTexts(new Uint8Array(bytes)))[0]!.map((t) => t.str.toLowerCase()).join(' ')
  const hit = ['xin', 'chào', 'việt', 'nam', 'hóa', 'đơn', '2024'].filter((w) => text.includes(w))
  expect(hit.length, `nhận được: ${text}`).toBeGreaterThanOrEqual(5)
})

test('OCR trang trắng: báo không nhận ra chữ và không tạo tệp', async ({ page }) => {
  test.setTimeout(120_000)
  const c = createCanvas(400, 300)
  const g = c.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, 400, 300)
  await page.goto('/tools/ocr')
  await page.locator('input[type=file]').setInputFiles([{ name: 'trang.png', mimeType: 'image/png', buffer: c.toBuffer('image/png') }])
  await page.getByLabel('Ngôn ngữ trong tài liệu').selectOption('eng')
  await page.getByRole('button', { name: 'Nhận dạng chữ', exact: true }).click()
  await expect(page.getByText('Không nhận ra chữ nào')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toHaveCount(0)
})

test('OCR PDF có mặt nạ độ sáng (ExtGState SMask Luminosity, như trang Wikipedia): không lỗi trong worker, vẫn nhận ra chữ', async ({ page }) => {
  test.setTimeout(120_000)
  // Trang quét (ảnh chữ) cộng một hình tô qua mặt nạ độ sáng: pdf.js cần bộ lọc ảnh (trước đây dùng `document`, worker không có).
  const doc = await PDFDocument.create()
  const png = await doc.embedPng(new Uint8Array(textPng(['Hello World', 'Invoice 2024']).buffer))
  const p = doc.addPage([500, 400])
  p.drawImage(png, { x: 0, y: 260, width: 500, height: 126 }) // đúng tỉ lệ ảnh 1000×252, chữ ở phía trên; hình tô nằm ở vùng trống phía dưới
  const ctx = doc.context
  const mask = ctx.register(ctx.stream('0.5 g 0 0 100 100 re f', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 100], Group: { S: 'Transparency', CS: 'DeviceGray' } }))
  p.node.Resources()!.set(PDFName.of('ExtGState'), ctx.obj({ GS1: { Type: 'ExtGState', SMask: { Type: 'Mask', S: 'Luminosity', G: mask } } }))
  p.node.addContentStream(ctx.register(ctx.stream('q /GS1 gs 1 0 0 rg 350 20 100 100 re f Q')))
  const bytes = Buffer.from(await doc.save())
  await page.goto('/tools/ocr')
  await page.locator('input[type=file]').setInputFiles([{ name: 'smask.pdf', mimeType: 'application/pdf', buffer: bytes }])
  await page.getByLabel('Ngôn ngữ trong tài liệu').selectOption('eng')
  await page.getByRole('button', { name: 'Nhận dạng chữ', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Tải về' }).first()).toBeVisible({ timeout: 90_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  const out = await downloadOf(page)
  const text = (await pageTexts(new Uint8Array(out)))[0]!.map((i) => i.str.toLowerCase()).join(' ')
  expect(text).toContain('hello')
  expect(text).toContain('invoice')
})
