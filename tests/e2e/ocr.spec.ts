import { readFileSync } from 'node:fs'
import { GlobalFonts, createCanvas } from '@napi-rs/canvas'
import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
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
