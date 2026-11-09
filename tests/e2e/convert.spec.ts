import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { unzipSync } from 'fflate'
import { PDFDocument } from 'pdf-lib'
import { pageTexts } from '../../src/tools/testUtils'

const fx = (n: string) => `tests/fixtures/${n}`
const pick = (page: Page, files: string[]) => page.locator('input[type=file]').setInputFiles(files.map(fx))
async function downloadOf(page: Page, name: string) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).first().click()])
  return readFileSync((await d.path())!)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/documents/all')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(dbs.map((d) => new Promise((r) => { const q = indexedDB.deleteDatabase(d.name!); q.onsuccess = q.onerror = q.onblocked = () => r(null) })))
  })
})

test('ảnh → PDF → lưu thư viện → mở từ thư viện → PDF → ảnh (zip)', async ({ page }) => {
  await page.goto('/tools/images-to-pdf')
  await pick(page, ['image-wide.png', 'image-tall.jpg', 'image-red.png'])
  await page.getByLabel('Tên tệp kết quả').fill('anh-ghep')
  await page.getByRole('button', { name: 'Tạo PDF' }).click()
  await page.getByRole('button', { name: 'Lưu vào thư viện' }).click()
  await expect(page.getByRole('button', { name: 'Đã lưu vào thư viện' })).toBeDisabled()

  await page.goto('/documents/all')
  await expect(page.getByText('anh-ghep.pdf')).toBeVisible()
  await expect(page.getByText('3 trang')).toBeVisible()

  await page.goto('/tools/pdf-to-images')
  await page.getByRole('button', { name: 'Thêm từ thư viện' }).click()
  await page.getByRole('dialog').getByLabel(/anh-ghep\.pdf/).check()
  await page.getByRole('button', { name: 'Thêm đã chọn' }).click()
  await expect(page.locator('ol').getByText('anh-ghep.pdf')).toBeVisible()
  await page.getByLabel('Độ phân giải').selectOption('72')
  await page.getByRole('button', { name: 'Chuyển sang ảnh' }).click()
  await expect(page.getByText('page-3.png')).toBeVisible()

  const zip = unzipSync(new Uint8Array(await downloadOf(page, 'Tải tất cả (.zip)')))
  expect(Object.keys(zip).sort()).toEqual(['page-1.png', 'page-2.png', 'page-3.png'])
  for (const data of Object.values(zip)) expect([...data.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
})

test('PDF → JPG: hủy được khi đang xử lý và không để lại kết quả dở', async ({ page }) => {
  await page.goto('/tools/pdf-to-images')
  await pick(page, ['heavy-20p.pdf'])
  await page.getByLabel('Độ phân giải').selectOption('300')
  await page.getByRole('button', { name: 'Chuyển sang ảnh' }).click()
  await page.getByRole('button', { name: 'Hủy' }).click()
  await expect(page.getByText('Đã hủy. Không có tệp nào được tạo.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toHaveCount(0)
  // Có thể chạy lại ngay sau khi hủy.
  await page.getByLabel('Độ phân giải').selectOption('72')
  await page.getByRole('button', { name: 'Chuyển sang ảnh' }).click()
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible()
})

test('TXT → PDF giữ tiếng Việt có dấu', async ({ page }) => {
  await page.goto('/tools/text-to-pdf')
  await pick(page, ['vietnamese.txt'])
  await page.getByRole('button', { name: 'Tạo PDF' }).click()
  const bytes = await downloadOf(page, 'Tải về')
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  const text = (await pageTexts(new Uint8Array(bytes)))[0]!.map((t) => t.str).join('\n')
  expect(text).toContain('Tiếng Việt có dấu')
})

test('ảnh hỏng: không có kết quả và báo lỗi rõ', async ({ page }) => {
  await page.goto('/tools/images-to-pdf')
  const bad = { name: 'hong.png', mimeType: 'image/png', buffer: Buffer.from('not an image') }
  await page.locator('input[type=file]').setInputFiles([bad])
  await page.getByRole('button', { name: 'Tạo PDF' }).click()
  await expect(page.getByRole('alert')).toContainText('không đọc được')
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toHaveCount(0)
})
