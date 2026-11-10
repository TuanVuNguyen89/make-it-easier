import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('trang Cài đặt trên web: có trong thanh bên, giải thích cập nhật, đạt axe', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Cài đặt' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('heading', { name: 'Cài đặt', level: 1 })).toBeVisible()
  await expect(page.getByText(/Bản web luôn là bản mới nhất/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kiểm tra bản mới' })).toHaveCount(0) // chỉ có trong app máy tính
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(res.violations.map((v) => v.id)).toEqual([])
})

test('OCR có tiếng Đức trong danh sách ngôn ngữ', async ({ page }) => {
  await page.goto('/tools/ocr')
  const sel = page.getByLabel('Ngôn ngữ trong tài liệu')
  await expect(sel.locator('option')).toContainText(['Tiếng Đức và tiếng Anh', 'Tiếng Đức'])
  await sel.selectOption('deu')
  await expect(sel).toHaveValue('deu')
})
