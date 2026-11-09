import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

const fx = (n: string) => `tests/fixtures/${n}`
const pick = (page: Page, files: string[]) => page.locator('input[type=file]').setInputFiles(files.map(fx))
async function downloadOf(page: Page, name: string) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).first().click()])
  return readFileSync((await d.path())!)
}

test('đặt mật khẩu: thiếu trường và mật khẩu không khớp báo lỗi dưới trường, rồi file ra yêu cầu mật khẩu', async ({ page }) => {
  await page.goto('/tools/protect')
  await pick(page, ['sample-1p.pdf'])
  await page.getByRole('button', { name: 'Đặt mật khẩu' }).click()
  await expect(page.getByText('Hãy nhập mật khẩu.')).toBeVisible()
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toBeFocused()

  await page.getByLabel('Mật khẩu', { exact: true }).fill('abc123')
  await page.getByLabel('Nhập lại mật khẩu').fill('khac')
  await page.getByRole('button', { name: 'Đặt mật khẩu' }).click()
  await expect(page.getByText('Hai mật khẩu chưa khớp')).toBeVisible()
  await expect(page.getByLabel('Nhập lại mật khẩu')).toHaveAttribute('aria-invalid', 'true')

  await page.getByLabel('Nhập lại mật khẩu').fill('abc123')
  await page.getByRole('button', { name: 'Đặt mật khẩu' }).click()
  const bytes = await downloadOf(page, 'Tải về')
  await expect(PDFDocument.load(bytes)).rejects.toThrow(/encrypt/i)
})

test('mở khóa: sai mật khẩu báo lỗi và không có kết quả; đúng mật khẩu thì tải được', async ({ page }) => {
  await page.goto('/tools/unlock')
  await pick(page, ['encrypted-secret.pdf'])
  await page.getByLabel('Mật khẩu').fill('sai')
  await page.getByRole('button', { name: 'Mở khóa' }).click()
  await expect(page.getByRole('alert')).toContainText('Mật khẩu không đúng')
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toHaveCount(0)

  await page.getByLabel('Mật khẩu').fill('secret')
  await page.getByRole('button', { name: 'Mở khóa' }).click()
  const doc = await PDFDocument.load(await downloadOf(page, 'Tải về'))
  expect(doc.getPageCount()).toBe(1)
})

test('nén: hiện dung lượng trước/sau và giữ nguyên số trang', async ({ page }) => {
  await page.goto('/tools/compress')
  await pick(page, ['heavy-20p.pdf'])
  await page.getByRole('button', { name: 'Nén PDF', exact: true }).click()
  await expect(page.getByText(/Dung lượng: .* → .* \(giảm \d+%\)/)).toBeVisible()
  const out = await downloadOf(page, 'Tải về')
  expect(out.byteLength).toBeLessThan(readFileSync(fx('heavy-20p.pdf')).byteLength * 0.8)
  expect((await PDFDocument.load(out)).getPageCount()).toBe(20)
})

test('nén tệp đã tối ưu: báo không giảm được và không tạo tệp mới', async ({ page }) => {
  await page.goto('/tools/compress')
  await pick(page, ['sample-1p.pdf'])
  await page.getByRole('button', { name: 'Nén PDF', exact: true }).click()
  await expect(page.getByText('không giảm thêm được dung lượng')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toHaveCount(0)
})
