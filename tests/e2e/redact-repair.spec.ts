import { readFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { pageTexts } from '../../src/tools/testUtils'

const fx = (n: string) => `tests/fixtures/${n}`
const pick = (page: Page, files: string[]) => page.locator('input[type=file]').setInputFiles(files.map(fx))
async function downloadOf(page: Page, name = 'Tải về') {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).first().click()])
  return readFileSync((await d.path())!)
}
async function rasterize(bytes: Uint8Array | Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' })
  const page = await (await task.promise).getPage(1)
  const vp = page.getViewport({ scale: 1 })
  const c = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height))
  await page.render({ canvas: c as never, viewport: vp, background: 'rgb(255,255,255)' }).promise
  const g = c.getContext('2d')
  const r = { width: c.width, height: c.height, at: (x: number, y: number) => [...g.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3) }
  await task.destroy()
  return r
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 })
})

test('sửa PDF: cả ba kiểu hỏng cấu trúc đều ra tệp đủ 10 trang', async ({ page }) => {
  for (const name of ['damaged-startxref.pdf', 'damaged-offsets.pdf', 'damaged-notrailer.pdf']) {
    await page.goto('/tools/repair')
    await pick(page, [name])
    await page.getByRole('button', { name: 'Sửa PDF', exact: true }).click()
    const bytes = await downloadOf(page)
    expect((await PDFDocument.load(bytes)).getPageCount(), name).toBe(10)
  }
})

test('sửa PDF: tệp bị cắt cụt mất nội dung báo lỗi rõ và không có kết quả', async ({ page }) => {
  await page.goto('/tools/repair')
  await pick(page, ['corrupt.pdf'])
  await page.getByRole('button', { name: 'Sửa PDF', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('không phải PDF hợp lệ')
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toHaveCount(0)
})

test('biên tập: nút khóa đến khi che; che vùng chữ thì chữ biến mất khỏi tệp và vùng đó đen', async ({ page }) => {
  await page.goto('/tools/redact')
  await pick(page, ['sample-1p.pdf'])
  await expect(page.getByTestId('page-0')).toBeVisible()
  const run = page.getByRole('button', { name: 'Áp dụng biên tập' })
  await expect(run).toBeDisabled()

  await page.getByRole('button', { name: 'Che thông tin (biên tập)' }).click()
  const s = page.getByTestId('page-0')
  await s.scrollIntoViewIfNeeded()
  const b = (await s.boundingBox())!
  // chữ "Sample - page 1/1" nằm ở khoảng y 58..82 / 842 và x 60..250 / 595
  await page.mouse.move(b.x + b.width * 0.08, b.y + b.height * 0.055)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.11, { steps: 6 })
  await page.mouse.up()
  await expect(run).toBeEnabled()
  await run.click()

  const bytes = await downloadOf(page)
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  expect((await pageTexts(new Uint8Array(bytes)))[0]).toEqual([]) // không còn chữ nào để trích xuất
  const img = await rasterize(bytes)
  expect(img.at(100, 70)[0]).toBeLessThan(10) // giữa vùng chữ cũ: đen
  expect(img.at(500, 400)).toEqual([255, 255, 255])
})
