import { expect, test } from '@playwright/test'

test('thư viện: bấm tên tệp mở bản xem trước PDF (trang được vẽ), ảnh và văn bản', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/documents/all')
  await page.locator('input[type=file]').first().setInputFiles(['tests/fixtures/sample-10p.pdf', 'tests/fixtures/sample.txt'])
  await expect(page.getByRole('button', { name: 'Xem trước sample-10p.pdf' })).toBeVisible()

  await page.getByRole('button', { name: 'Xem trước sample-10p.pdf' }).click()
  const dlg = page.getByRole('dialog', { name: 'sample-10p.pdf' })
  await expect(dlg.getByRole('img', { name: 'Trang 1' })).toBeVisible()
  const ok = await dlg.getByRole('img', { name: 'Trang 1' }).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 100)
  expect(ok).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()

  await page.getByRole('button', { name: 'Xem trước sample.txt' }).click()
  await expect(page.getByRole('dialog', { name: 'sample.txt' }).locator('pre')).not.toBeEmpty()
  await page.getByRole('button', { name: 'Đóng' }).click()

  await page.goto('/images/all')
  await page.locator('input[type=file]').first().setInputFiles(['tests/fixtures/image-red.png'])
  await page.getByRole('button', { name: 'Xem trước image-red.png' }).click()
  await expect(page.getByRole('dialog', { name: 'image-red.png' }).getByRole('img', { name: 'image-red.png' })).toBeVisible()
  await page.getByRole('button', { name: 'Đóng' }).click()
})
