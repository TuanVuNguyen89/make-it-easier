import { GlobalFonts, createCanvas } from '@napi-rs/canvas'
import { expect, test, type Page } from '@playwright/test'

GlobalFonts.registerFromPath('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf', 'DejaVu Sans')
const textPng = () => {
  const c = createCanvas(900, 200)
  const g = c.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, 900, 200)
  g.fillStyle = '#000'
  g.font = '64px "DejaVu Sans"'
  g.fillText('Hello World 2024', 40, 120)
  return { name: 'chu.png', mimeType: 'image/png', buffer: c.toBuffer('image/png') }
}

const fx = (n: string) => `tests/fixtures/${n}`
const pick = (page: Page, files: string[]) => page.locator('input[type=file]').setInputFiles(files.map(fx))

test('sau lần tải đầu, ứng dụng và mọi công cụ chạy được khi mất mạng', async ({ page, context }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  // Đợi precache xong (tải đủ chunk, wasm, phông, tài nguyên pdf.js).
  await page.waitForFunction(async () => {
    const names = await caches.keys()
    if (names.length === 0) return false
    return (await (await caches.open(names[0]!)).keys()).length > 200
  }, undefined, { timeout: 45_000 })

  // OCR cần dữ liệu ngôn ngữ ~10 MB không precache: dùng một lần khi còn mạng để được cache, rồi phải chạy lại được khi offline.
  await page.goto('/tools/ocr')
  await page.locator('input[type=file]').setInputFiles([textPng()])
  await page.getByLabel('Ngôn ngữ trong tài liệu').selectOption('eng')
  await page.getByRole('button', { name: 'Nhận dạng chữ', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible({ timeout: 60_000 })
  await page.goto('/')

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Bạn chưa thêm tài liệu nào')).toBeVisible()
  // Đối chứng: mạng đã thật sự tắt và trang đang do service worker phục vụ.
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
  expect(await page.evaluate(() => fetch('https://example.com/').then(() => 'reached', () => 'blocked'))).toBe('blocked')
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  const done = async () => expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible()

  // Thư viện (IndexedDB)
  await pick(page, ['sample-10p.pdf'])
  await expect(page.getByText('Đã thêm 1 tệp')).toBeVisible()

  // pdf-lib trong worker
  await page.goto('/tools/merge')
  await pick(page, ['sample-1p.pdf', 'sample-10p.pdf'])
  await page.getByRole('button', { name: 'Gộp PDF', exact: true }).click()
  await done()

  // qpdf wasm
  await page.goto('/tools/protect')
  await pick(page, ['sample-1p.pdf'])
  await page.getByLabel('Mật khẩu', { exact: true }).fill('abc')
  await page.getByLabel('Nhập lại mật khẩu').fill('abc')
  await page.getByRole('button', { name: 'Đặt mật khẩu' }).click()
  await done()

  // phông Unicode
  await page.goto('/tools/watermark')
  await pick(page, ['sample-1p.pdf'])
  await page.getByLabel('Chữ hình mờ').fill('BẢN NHÁP')
  await page.getByRole('button', { name: 'Thêm hình mờ', exact: true }).click()
  await done()

  // pdf.js trong worker lồng + tài nguyên phông chuẩn
  await page.goto('/tools/pdf-to-images')
  await pick(page, ['sample-10p.pdf'])
  await page.getByLabel('Độ phân giải').selectOption('72')
  await page.getByRole('button', { name: 'Chuyển sang ảnh' }).click()
  await expect(page.getByText('page-10.png')).toBeVisible()

  // công cụ ảnh (AVIF dùng wasm), Office (pptxgenjs trong worker), OCR (dữ liệu từ cache khi dùng lần đầu)
  await page.goto('/tools/image-to-avif')
  await pick(page, ['image-red.png'])
  await page.getByRole('button', { name: 'Chuyển sang AVIF', exact: true }).click()
  await done()
  await page.goto('/tools/docx-to-pdf')
  await pick(page, ['report.docx'])
  await page.getByRole('button', { name: 'Chuyển sang PDF' }).click()
  await done()
  await page.goto('/tools/pdf-to-pptx')
  await pick(page, ['sample-1p.pdf'])
  await page.getByRole('button', { name: 'Chuyển sang PowerPoint' }).click()
  await done()
  await page.goto('/tools/ocr')
  await page.locator('input[type=file]').setInputFiles([textPng()])
  await page.getByLabel('Ngôn ngữ trong tài liệu').selectOption('eng')
  await page.getByRole('button', { name: 'Nhận dạng chữ', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible({ timeout: 60_000 })

  // thumbnail trên luồng chính
  await page.goto('/tools/organize-pages')
  await pick(page, ['sample-10p.pdf'])
  const thumb = page.locator('img[alt="Trang gốc 1"]')
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
})

test('manifest hợp lệ và có thể cài đặt', async ({ page }) => {
  await page.goto('/')
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  const res = await page.request.get(href!)
  const m = await res.json()
  expect(m).toMatchObject({ name: 'Make it easier', display: 'standalone', lang: 'vi' })
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  for (const icon of m.icons) expect((await page.request.get(`/${icon.src}`)).ok()).toBe(true)
})
