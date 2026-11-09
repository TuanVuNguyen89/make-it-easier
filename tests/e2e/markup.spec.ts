import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { pageTexts } from '../../src/tools/testUtils'

const fx = (n: string) => `tests/fixtures/${n}`
const pick = (page: Page, files: string[]) => page.locator('input[type=file]').setInputFiles(files.map(fx))
async function downloadOf(page: Page) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Tải về' }).first().click()])
  return readFileSync((await d.path())!)
}

test('cắt trang: lề 10 mm đổi CropBox của mọi trang', async ({ page }) => {
  await page.goto('/tools/crop-pages')
  await pick(page, ['sample-10p.pdf'])
  await page.getByLabel('Cắt lề trên (mm)').fill('10')
  await page.getByLabel('Cắt lề trái (mm)').fill('10')
  await page.getByRole('button', { name: 'Cắt trang', exact: true }).click()
  const doc = await PDFDocument.load(await downloadOf(page))
  const b = doc.getPage(0).getCropBox()
  expect(b.x).toBeCloseTo((10 * 72) / 25.4, 1)
  expect(b.width).toBeCloseTo(595 - (10 * 72) / 25.4, 1)
})

test('cắt trang không đặt lề nào: báo tùy chọn chưa hợp lệ', async ({ page }) => {
  await page.goto('/tools/crop-pages')
  await pick(page, ['sample-1p.pdf'])
  await page.getByRole('button', { name: 'Cắt trang', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Tùy chọn chưa hợp lệ')
})

test('đánh số trang: tệp ra có 10 trang và nội dung "10" ở trang cuối', async ({ page }) => {
  await page.goto('/tools/page-numbers')
  await pick(page, ['sample-10p.pdf'])
  await page.getByLabel('Vị trí số trang').selectOption('top-right')
  await page.getByRole('button', { name: 'Đánh số trang', exact: true }).click()
  const bytes = await downloadOf(page)
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(10)
  const texts = await pageTexts(new Uint8Array(bytes))
  const numbers = texts.map((t) => t.find((x) => /^\d+$/.test(x.str))!)
  expect(numbers.map((n) => n.str)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  expect(numbers[9]!.y).toBeGreaterThan(780) // vị trí "trên-phải"
  expect(numbers[9]!.x).toBeGreaterThan(500)
})

test('hình mờ chữ tiếng Việt: tạo được tệp và giữ số trang', async ({ page }) => {
  await page.goto('/tools/watermark')
  await pick(page, ['sample-1p.pdf'])
  await page.getByLabel('Chữ hình mờ').fill('BẢN NHÁP')
  await page.getByRole('button', { name: 'Thêm hình mờ', exact: true }).click()
  const bytes = await downloadOf(page)
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  const text = (await pageTexts(new Uint8Array(bytes)))[0]!.map((t) => t.str).join('')
  expect(text).toContain('BẢN NHÁP')
})

test('hình mờ ảnh: PDF + PNG được nhận cùng lúc', async ({ page }) => {
  await page.goto('/tools/watermark')
  await pick(page, ['sample-1p.pdf', 'image-red.png'])
  await expect(page.getByText('image-red.png')).toBeVisible()
  await page.getByRole('button', { name: 'Thêm hình mờ', exact: true }).click()
  const bytes = await downloadOf(page)
  expect(Buffer.from(bytes).includes('/Subtype /Image') || Buffer.from(bytes).includes('/Image')).toBe(true)
})

test('hình mờ không có chữ lẫn ảnh: báo lỗi, không có kết quả', async ({ page }) => {
  await page.goto('/tools/watermark')
  await pick(page, ['sample-1p.pdf'])
  await page.getByRole('button', { name: 'Thêm hình mờ', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Tùy chọn chưa hợp lệ')
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toHaveCount(0)
})
