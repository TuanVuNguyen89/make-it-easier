import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { strFromU8, unzipSync } from 'fflate'
import { pageTexts } from '../../src/tools/testUtils'

const fx = (n: string) => `tests/fixtures/${n}`
const pick = (page: Page, files: string[]) => page.locator('input[type=file]').setInputFiles(files.map(fx))
async function downloadOf(page: Page, name = 'Tải về') {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).first().click()])
  return readFileSync((await d.path())!)
}
const textOf = async (pdf: Buffer) => (await pageTexts(new Uint8Array(pdf))).map((p) => p.map((i) => i.str).join(' ')).join(' | ')

test('Chuyển đổi PDF: chọn DOCX → gợi ý "Word sang PDF" → tệp được chuyển sang công cụ đích → ra PDF đúng nội dung', async ({ page }) => {
  await page.goto('/tools/convert')
  await pick(page, ['report.docx'])
  await expect(page.getByRole('status')).toContainText('Word')
  await expect(page.getByRole('button', { name: /Word sang PDF/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Excel sang PDF/ })).toHaveCount(0)
  await page.getByRole('button', { name: /Word sang PDF/ }).click()
  await expect(page).toHaveURL(/\/tools\/docx-to-pdf$/)
  await expect(page.getByText('report.docx')).toBeVisible() // đã nhận sẵn, không phải chọn lại
  await page.getByRole('button', { name: 'Chuyển sang PDF' }).click()
  const text = await textOf(await downloadOf(page))
  expect(text).toContain('Báo cáo quý ba')
  expect(text).toContain('Nguyễn Văn An')
  expect(text).toContain('Doanh thu tăng 12 phần trăm')
})

test('Chuyển đổi PDF: PDF gợi ý năm đích; tệp lạ báo chưa hỗ trợ', async ({ page }) => {
  await page.goto('/tools/convert')
  await pick(page, ['sample-1p.pdf'])
  for (const name of [/PDF sang Word/, /PDF sang Excel/, /PDF sang PowerPoint/, /PDF sang ảnh/, /Nhận dạng chữ/]) await expect(page.getByRole('button', { name })).toBeVisible()
  await page.getByRole('button', { name: /PDF sang Word/ }).click()
  await expect(page).toHaveURL(/\/tools\/pdf-to-docx$/)
  await expect(page.getByText('sample-1p.pdf')).toBeVisible()

  await page.goto('/tools/convert')
  await page.locator('input[type=file]').setInputFiles([{ name: 'a.zip', mimeType: 'application/zip', buffer: Buffer.from('x') }])
  await expect(page.getByRole('alert')).toContainText('Chưa hỗ trợ')
})

test('Excel và PowerPoint sang PDF trong trình duyệt', async ({ page }) => {
  await page.goto('/tools/xlsx-to-pdf')
  await pick(page, ['table.xlsx'])
  await page.getByRole('button', { name: 'Chuyển sang PDF' }).click()
  const x = await textOf(await downloadOf(page))
  for (const s of ['Sản phẩm', 'Bút bi', 'Vở kẻ ngang', '12000']) expect(x).toContain(s)

  await page.goto('/tools/pptx-to-pdf')
  await pick(page, ['deck.pptx'])
  await page.getByRole('button', { name: 'Chuyển sang PDF' }).click()
  const bytes = await downloadOf(page)
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3)
  const p = await textOf(bytes)
  expect(p).toContain('Báo cáo tổng kết năm')
  expect(p).toContain('Cảm ơn')
})

test('PDF sang Word, Excel, PowerPoint trong trình duyệt (pptxgenjs chạy trong worker)', async ({ page }) => {
  await page.goto('/tools/pdf-to-docx')
  await pick(page, ['sample-10p.pdf'])
  await page.getByRole('button', { name: 'Chuyển sang Word' }).click()
  const docx = unzipSync(new Uint8Array(await downloadOf(page)))
  const body = strFromU8(docx['word/document.xml']!)
  expect(body).toContain('Sample - page 1/10')
  expect(body).toContain('Sample - page 10/10')
  expect((body.match(/w:type="page"/g) ?? []).length).toBe(9) // 10 trang → 9 ngắt trang

  await page.goto('/tools/pdf-to-xlsx')
  await pick(page, ['sample-1p.pdf'])
  await page.getByRole('button', { name: 'Chuyển sang Excel' }).click()
  const xlsx = unzipSync(new Uint8Array(await downloadOf(page)))
  expect(strFromU8(xlsx['xl/worksheets/sheet1.xml']!)).toContain('Sample - page 1/1')
  expect(strFromU8(xlsx['xl/workbook.xml']!)).toContain('Trang 1')

  await page.goto('/tools/pdf-to-pptx')
  await pick(page, ['sample-10p.pdf'])
  await page.getByRole('button', { name: 'Chuyển sang PowerPoint' }).click()
  const pptx = unzipSync(new Uint8Array(await downloadOf(page)))
  expect(Object.keys(pptx).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(10)
  expect(Object.keys(pptx).filter((n) => /^ppt\/media\//.test(n)).length).toBeGreaterThanOrEqual(10)
})

test('PDF không có lớp chữ: báo rõ và dẫn tới công cụ OCR; tệp Office hỏng báo lỗi rõ', async ({ page }) => {
  const blank = await PDFDocument.create()
  blank.addPage([300, 300])
  await page.goto('/tools/pdf-to-docx')
  await page.locator('input[type=file]').setInputFiles([{ name: 'quet.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await blank.save()) }])
  await page.getByRole('button', { name: 'Chuyển sang Word' }).click()
  await expect(page.getByRole('alert')).toContainText('không có lớp chữ')
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toHaveCount(0)
  await page.getByRole('alert').getByRole('link', { name: 'Nhận dạng chữ (OCR)' }).click()
  await expect(page).toHaveURL(/\/tools\/ocr$/)

  await page.goto('/tools/docx-to-pdf')
  await page.locator('input[type=file]').setInputFiles([{ name: 'hong.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('không phải zip') }])
  await page.getByRole('button', { name: 'Chuyển sang PDF' }).click()
  await expect(page.getByRole('alert')).toContainText('bị hỏng hoặc không đúng định dạng')
})
