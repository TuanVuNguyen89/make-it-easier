import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

const fx = (n: string) => `tests/fixtures/${n}`

test('danh mục công cụ liệt kê Gộp PDF và mở được trang công cụ', async ({ page }) => {
  await page.goto('/tools')
  await expect(page.getByRole('heading', { name: 'Công cụ', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: /Gộp PDF/ }).click()
  await expect(page.getByRole('heading', { name: 'Gộp PDF', level: 1 })).toBeVisible()
})

test('gộp 2 PDF: nút khóa khi thiếu tệp, chạy trong worker, tải về đúng số trang', async ({ page }) => {
  await page.goto('/tools/merge')
  const run = page.getByRole('button', { name: 'Gộp PDF' })
  await expect(run).toBeDisabled()
  await expect(page.getByText('Cần chọn ít nhất 2 tệp để tiếp tục.')).toBeVisible()

  await page.locator('input[type=file]').setInputFiles([fx('sample-1p.pdf'), fx('sample-10p.pdf')])
  await expect(page.getByText('sample-1p.pdf')).toBeVisible()
  await expect(run).toBeEnabled()

  // đổi thứ tự rồi đặt tên kết quả
  await page.getByRole('button', { name: 'Chuyển sample-10p.pdf lên trên' }).click()
  await page.getByLabel('Tên tệp kết quả').fill('bao-cao')
  await run.click()

  await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Tải về' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('bao-cao.pdf')
  const path = await download.path()
  const doc = await PDFDocument.load(readFileSync(path))
  expect(doc.getPageCount()).toBe(11)
})

test('PDF có mật khẩu: báo lỗi rõ và không có kết quả', async ({ page }) => {
  await page.goto('/tools/merge')
  await page.locator('input[type=file]').setInputFiles([fx('sample-1p.pdf'), fx('encrypted-secret.pdf')])
  await page.getByRole('button', { name: 'Gộp PDF' }).click()
  await expect(page.getByRole('alert')).toContainText('bảo vệ bằng mật khẩu')
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toHaveCount(0)
})

test('tệp sai loại bị bỏ qua và có thông báo', async ({ page }) => {
  await page.goto('/tools/merge')
  await page.locator('input[type=file]').setInputFiles([fx('sample.txt')])
  await expect(page.getByText('Bỏ qua 1 tệp không đúng loại.')).toBeVisible()
  await expect(page.getByText('Chưa chọn tệp nào.')).toBeVisible()
})

test('đổi ngôn ngữ sang English và giữ sau khi tải lại', async ({ page }) => {
  await page.goto('/tools')
  await page.getByLabel('Ngôn ngữ').selectOption('en')
  await expect(page.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})
