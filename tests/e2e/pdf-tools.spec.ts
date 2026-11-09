import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { unzipSync } from 'fflate'
import { PDFDocument } from 'pdf-lib'

const fx = (n: string) => `tests/fixtures/${n}`
const pick = (page: Page, files: string[]) => page.locator('input[type=file]').setInputFiles(files.map(fx))

async function downloadOf(page: Page, name: string | RegExp) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).first().click()])
  return readFileSync((await d.path())!)
}

test('danh mục: lọc theo nhóm và tìm công cụ', async ({ page }) => {
  await page.goto('/tools')
  await expect(page.getByRole('link', { name: /Tách PDF/ })).toBeVisible()
  await page.getByRole('button', { name: 'Chuyển đổi', exact: true }).click()
  await expect(page.getByRole('link', { name: /Tách PDF/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Tất cả công cụ' }).click()
  await page.getByLabel('Tìm công cụ').fill('xoay')
  await expect(page.getByRole('link', { name: /Xoay trang/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Gộp PDF/ })).toHaveCount(0)
  await page.getByLabel('Tìm công cụ').fill('khongco')
  await expect(page.getByText('Không có công cụ phù hợp.')).toBeVisible()
})

test('tách "1-3, 4-10": ra 2 tệp đúng số trang, tải zip', async ({ page }) => {
  await page.goto('/tools/split')
  await pick(page, ['sample-10p.pdf'])
  await page.getByLabel('Trang', { exact: true }).fill('1-3, 4-10')
  await page.getByRole('button', { name: 'Tách PDF' }).click()
  await expect(page.getByText('part-1.pdf')).toBeVisible()
  await expect(page.getByText('part-2.pdf')).toBeVisible()

  const zip = unzipSync(new Uint8Array(await downloadOf(page, 'Tải tất cả (.zip)')))
  expect(Object.keys(zip).sort()).toEqual(['part-1.pdf', 'part-2.pdf'])
  expect((await PDFDocument.load(zip['part-1.pdf']!)).getPageCount()).toBe(3)
  expect((await PDFDocument.load(zip['part-2.pdf']!)).getPageCount()).toBe(7)
})

test('khoảng trang sai: báo lỗi, không có kết quả', async ({ page }) => {
  await page.goto('/tools/extract-pages')
  await pick(page, ['sample-10p.pdf'])
  await page.getByLabel('Trang', { exact: true }).fill('11')
  await page.getByRole('button', { name: 'Trích xuất' }).click()
  await expect(page.getByRole('alert')).toContainText('Tùy chọn chưa hợp lệ')
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toHaveCount(0)
})

test('xoay trang chọn rồi tải về', async ({ page }) => {
  await page.goto('/tools/rotate-pages')
  await pick(page, ['sample-10p.pdf'])
  await page.getByLabel('Trang', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Xoay trang', exact: true }).click()
  const doc = await PDFDocument.load(await downloadOf(page, 'Tải về'))
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 0, 0, 0, 0, 0, 0, 0, 0])
})

test('sắp xếp trang trực quan: thumbnail hiện ra, xóa/xoay/đổi chỗ rồi xuất đúng', async ({ page }) => {
  await page.goto('/tools/organize-pages')
  await pick(page, ['sample-10p.pdf'])
  await expect(page.getByText('Còn 10 trang')).toBeVisible()
  const firstThumb = page.locator('img[alt="Trang gốc 1"]')
  await expect.poll(() => firstThumb.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)

  await page.getByRole('button', { name: 'Xóa trang 1', exact: true }).click()
  await expect(page.getByText('Còn 9 trang')).toBeVisible()
  await page.getByRole('button', { name: 'Xoay phải trang 1', exact: true }).click()
  await page.getByRole('button', { name: 'Chuyển trang 1 ra sau', exact: true }).click()
  await page.getByRole('button', { name: 'Lưu thứ tự mới' }).click()

  const doc = await PDFDocument.load(await downloadOf(page, 'Tải về'))
  expect(doc.getPageCount()).toBe(9)
  expect(doc.getPages().slice(0, 3).map((p) => p.getRotation().angle)).toEqual([0, 90, 0])
})

test('sắp xếp trang: kéo thả đổi thứ tự', async ({ page }) => {
  await page.goto('/tools/organize-pages')
  await pick(page, ['sample-10p.pdf'])
  await expect(page.getByText('Còn 10 trang')).toBeVisible()
  // Đánh dấu trang 1 bằng cách xoay, rồi kéo nó xuống vị trí 3.
  await page.getByRole('button', { name: 'Xoay phải trang 1', exact: true }).click()
  const items = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /Xoay phải trang/ }) })
  await items.nth(0).dragTo(items.nth(2))
  await page.getByRole('button', { name: 'Lưu thứ tự mới' }).click()
  const doc = await PDFDocument.load(await downloadOf(page, 'Tải về'))
  expect(doc.getPages().slice(0, 4).map((p) => p.getRotation().angle)).toEqual([0, 0, 90, 0])
})

test('PDF có mật khẩu trong công cụ khác: báo lỗi kèm liên kết tới Mở khóa', async ({ page }) => {
  await page.goto('/tools/split')
  await pick(page, ['encrypted-secret.pdf'])
  await page.getByLabel('Trang', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Tách PDF' }).click()
  await expect(page.getByRole('alert')).toContainText('bảo vệ bằng mật khẩu')
  await page.getByRole('alert').getByRole('link', { name: 'Mở khóa PDF' }).click()
  await expect(page).toHaveURL(/\/tools\/unlock$/)
})
