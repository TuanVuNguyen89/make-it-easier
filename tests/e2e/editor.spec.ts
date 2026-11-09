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

/** Vẽ trang đầu của PDF bằng pdf.js (bản legacy) và canvas native để kiểm tra điểm ảnh của tệp tải về. */
async function rasterize(bytes: Uint8Array | Buffer, pageIndex = 0) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' })
  const doc = await task.promise
  const page = await doc.getPage(pageIndex + 1)
  const vp = page.getViewport({ scale: 1 })
  const c = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height))
  await page.render({ canvas: c as never, viewport: vp, background: 'rgb(255,255,255)' }).promise
  const g = c.getContext('2d')
  const out = { width: c.width, height: c.height, at: (x: number, y: number) => [...g.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3) }
  await task.destroy()
  return out
}

/** Vị trí điểm (theo tỉ lệ 0..1) trên bề mặt trang trong màn hình. */
async function surface(page: Page, index = 0) {
  const s = page.getByTestId(`page-${index}`)
  await s.scrollIntoViewIfNeeded()
  const b = (await s.boundingBox())!
  return { b, at: (fx: number, fy: number) => ({ x: b.x + b.width * fx, y: b.y + b.height * fy }) }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 })
})

test('danh mục có nhóm Chú thích và ký với ba công cụ', async ({ page }) => {
  await page.goto('/tools')
  for (const name of [/Chú thích PDF/, /Chỉnh sửa PDF/, /Ký PDF/]) await expect(page.getByRole('link', { name })).toBeVisible()
  await page.getByRole('button', { name: 'Chú thích và ký' }).click()
  await expect(page.getByRole('link', { name: /Gộp PDF/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Ký PDF/ })).toBeVisible()
})

test('chú thích: nút khóa đến khi có thành phần; vẽ tay + tô sáng + văn bản rồi xuất đúng', async ({ page }) => {
  await page.goto('/tools/annotate')
  await pick(page, ['sample-1p.pdf'])
  const run = page.getByRole('button', { name: 'Lưu chú thích' })
  await expect(page.getByTestId('page-0')).toBeVisible()
  await expect(run).toBeDisabled()
  await expect(page.getByText('Hãy thêm ít nhất một thành phần lên trang trước.')).toBeVisible()

  // vẽ tay một đường ngang ở 60% chiều cao (đo vị trí trang SAU khi bấm nút công cụ vì trang có thể cuộn)
  await page.getByRole('button', { name: 'Vẽ tay' }).click()
  let s = await surface(page)
  await page.mouse.move(s.at(0.2, 0.6).x, s.at(0.2, 0.6).y)
  await page.mouse.down()
  await page.mouse.move(s.at(0.8, 0.6).x, s.at(0.8, 0.6).y, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByText('1 thành phần đã thêm')).toBeVisible()
  await expect(run).toBeEnabled()

  // tô sáng một vùng ở 30% chiều cao
  await page.getByRole('button', { name: 'Tô sáng' }).click()
  s = await surface(page)
  await page.mouse.move(s.at(0.2, 0.3).x, s.at(0.2, 0.3).y)
  await page.mouse.down()
  await page.mouse.move(s.at(0.7, 0.36).x, s.at(0.7, 0.36).y, { steps: 6 })
  await page.mouse.up()

  // văn bản
  await page.getByRole('button', { name: 'Văn bản', exact: true }).click()
  s = await surface(page)
  await page.mouse.click(s.at(0.2, 0.8).x, s.at(0.2, 0.8).y)
  await page.getByLabel('Nội dung').fill('Ghi chú kiểm thử')
  await expect(page.getByText('3 thành phần đã thêm')).toBeVisible()

  await run.click()
  const bytes = await downloadOf(page)
  const doc = await PDFDocument.load(bytes)
  expect(doc.getPageCount()).toBe(1)
  const text = (await pageTexts(new Uint8Array(bytes)))[0]!.map((t) => t.str).join(' ')
  expect(text).toContain('Ghi chú kiểm thử')

  const img = await rasterize(bytes)
  // nét vẽ tay ở 60% chiều cao, giữa trang: đỏ (màu mặc định #d32f2f)
  const stroke = img.at(img.width * 0.5, img.height * 0.6)
  expect(stroke[0]).toBeGreaterThan(150)
  expect(stroke[1]).toBeLessThan(90)
  // tô sáng: vàng (xanh dương thấp hơn trắng) ở vùng không có chữ
  const hl = img.at(img.width * 0.45, img.height * 0.33)
  expect(hl[2]).toBeLessThan(235)
  expect(img.at(img.width * 0.9, img.height * 0.33)).toEqual([255, 255, 255])
})

test('chọn, di chuyển, đổi cỡ, hoàn tác/làm lại và xóa thành phần', async ({ page }) => {
  await page.goto('/tools/edit')
  await pick(page, ['sample-1p.pdf'])
  await expect(page.getByTestId('page-0')).toBeVisible()
  await page.getByRole('button', { name: 'Hình chữ nhật', exact: true }).click()
  const s = await surface(page)
  await page.mouse.move(s.at(0.2, 0.5).x, s.at(0.2, 0.5).y)
  await page.mouse.down()
  await page.mouse.move(s.at(0.4, 0.6).x, s.at(0.4, 0.6).y, { steps: 5 })
  await page.mouse.up()
  const shape = page.locator('[data-annotation="rect"]')
  await expect(shape).toHaveCount(1)

  const before = (await shape.locator('rect').first().boundingBox())!

  // chọn rồi kéo sang phải
  await page.getByRole('button', { name: 'Chọn và di chuyển' }).click()
  await shape.locator('rect').first().click({ position: { x: 3, y: 3 } })
  await page.mouse.move(before.x + 3, before.y + 3)
  await page.mouse.down()
  await page.mouse.move(before.x + 3 + 120, before.y + 3, { steps: 6 })
  await page.mouse.up()
  const after = (await shape.locator('rect').first().boundingBox())!
  expect(after.x - before.x).toBeGreaterThan(80)

  // hoàn tác đưa về vị trí cũ, làm lại đưa sang phải
  await page.getByRole('button', { name: 'Hoàn tác' }).click()
  expect(Math.abs((await shape.locator('rect').first().boundingBox())!.x - before.x)).toBeLessThan(3)
  await page.getByRole('button', { name: 'Làm lại' }).click()
  expect((await shape.locator('rect').first().boundingBox())!.x - before.x).toBeGreaterThan(80)

  // xóa
  await shape.locator('rect').first().click({ position: { x: 3, y: 3 } })
  await page.getByRole('button', { name: 'Xóa thành phần đã chọn' }).click()
  await expect(page.locator('[data-annotation]')).toHaveCount(0)
  await expect(page.getByText('0 thành phần đã thêm')).toBeVisible()
})

test('chỉnh sửa: ô trắng che chữ của trang thật sự (kiểm tra điểm ảnh tệp xuất)', async ({ page }) => {
  await page.goto('/tools/edit')
  await pick(page, ['sample-1p.pdf'])
  await expect(page.getByTestId('page-0')).toBeVisible()
  const src = await rasterize(readFileSync(fx('sample-1p.pdf')))
  // chữ "Sample - page 1/1" nằm ở khoảng y = 842-760-24 = ~58..82 của trang A4 (cao 842), x 60..250
  const darkBefore = (() => { let n = 0; for (let y = 56; y < 86; y++) for (let x = 60; x < 250; x++) if (src.at(x, y)[0]! < 100) n++; return n })()
  expect(darkBefore).toBeGreaterThan(80)

  await page.getByRole('button', { name: 'Ô trắng (che vùng)' }).click()
  const s = await surface(page)
  await page.mouse.move(s.at(0.05, 0.04).x, s.at(0.05, 0.04).y)
  await page.mouse.down()
  await page.mouse.move(s.at(0.6, 0.12).x, s.at(0.6, 0.12).y, { steps: 6 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  const out = await rasterize(await downloadOf(page))
  let darkAfter = 0
  for (let y = 56; y < 86; y++) for (let x = 60; x < 250; x++) if (out.at(x, y)[0]! < 100) darkAfter++
  expect(darkAfter).toBe(0)
})

test('ký: vẽ chữ ký, đặt lên trang, thêm ngày và hộp kiểm, xuất đúng', async ({ page }) => {
  await page.goto('/tools/sign')
  await pick(page, ['sample-1p.pdf'])
  await expect(page.getByTestId('page-0')).toBeVisible()
  await page.getByRole('button', { name: 'Chữ ký', exact: true }).click()
  const dlg = page.getByRole('dialog')
  const canvas = dlg.getByLabel('Vùng vẽ chữ ký')
  const cb = (await canvas.boundingBox())!
  await page.mouse.move(cb.x + 30, cb.y + 100)
  await page.mouse.down()
  await page.mouse.move(cb.x + 150, cb.y + 40, { steps: 8 })
  await page.mouse.move(cb.x + 300, cb.y + 140, { steps: 8 })
  await page.mouse.up()
  await dlg.getByRole('button', { name: 'Dùng chữ ký' }).click()
  await expect(page.locator('[data-annotation="image"]')).toHaveCount(1) // tự đặt vào giữa trang

  await page.getByRole('button', { name: 'Ngày tháng' }).click()
  let s = await surface(page)
  await page.mouse.click(s.at(0.15, 0.9).x, s.at(0.15, 0.9).y)
  await page.getByRole('button', { name: 'Hộp kiểm', exact: true }).click()
  s = await surface(page)
  await page.mouse.click(s.at(0.7, 0.9).x, s.at(0.7, 0.9).y)
  await expect(page.getByText('3 thành phần đã thêm')).toBeVisible()

  await page.getByRole('button', { name: 'Lưu bản đã ký' }).click()
  const bytes = await downloadOf(page)
  const today = new Intl.DateTimeFormat('vi', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())
  const text = (await pageTexts(new Uint8Array(bytes)))[0]!.map((t) => t.str).join(' ')
  expect(text).toContain(today)
  const img = await rasterize(bytes)
  // giữa trang có nét chữ ký (điểm tối) trong vùng trung tâm
  let dark = 0
  for (let y = img.height * 0.4; y < img.height * 0.6; y++) for (let x = img.width * 0.3; x < img.width * 0.7; x += 1) if (img.at(x, y)[0]! < 90) dark++
  expect(dark).toBeGreaterThan(30)
})

test('chữ ký gõ tên bằng tiếng Việt và dùng lại chữ ký đã lưu', async ({ page }) => {
  await page.goto('/tools/sign')
  await pick(page, ['sample-1p.pdf'])
  await page.getByRole('button', { name: 'Chữ ký', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('tab', { name: 'Gõ' }).click()
  await dlg.getByLabel('Gõ tên của bạn').fill('Nguyễn Văn An')
  await dlg.getByRole('button', { name: 'Dùng chữ ký' }).click()
  await expect(page.locator('[data-annotation="image"]')).toHaveCount(1)

  await page.goto('/tools/sign')
  await pick(page, ['sample-1p.pdf'])
  await page.getByRole('button', { name: 'Chữ ký', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Dùng chữ ký đã lưu' }).click()
  await expect(page.locator('[data-annotation="image"]')).toHaveCount(1)
})

test('chữ ký rỗng bị từ chối ở hộp thoại', async ({ page }) => {
  await page.goto('/tools/sign')
  await pick(page, ['sample-1p.pdf'])
  await page.getByRole('button', { name: 'Chữ ký', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Dùng chữ ký' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Hãy vẽ, gõ hoặc tải lên chữ ký trước.')
})

test('trang xoay: chú thích xuất đúng hướng nhìn thấy', async ({ page }) => {
  const doc = await PDFDocument.create()
  const p = doc.addPage([400, 300])
  p.setRotation({ type: 'degrees', angle: 90 } as never)
  const rotated = Buffer.from(await doc.save())
  await page.goto('/tools/edit')
  await page.locator('input[type=file]').setInputFiles([{ name: 'xoay.pdf', mimeType: 'application/pdf', buffer: rotated }])
  await expect(page.getByTestId('page-0')).toBeVisible()
  await page.getByRole('button', { name: 'Hình chữ nhật', exact: true }).click()
  const s = await surface(page)
  expect(s.b.height).toBeGreaterThan(s.b.width) // trang xoay 90° hiển thị dọc
  await page.mouse.move(s.at(0.05, 0.03).x, s.at(0.05, 0.03).y)
  await page.mouse.down()
  await page.mouse.move(s.at(0.3, 0.1).x, s.at(0.3, 0.1).y, { steps: 5 })
  await page.mouse.up()
  // tô đặc cho dễ kiểm tra điểm ảnh
  await page.getByRole('button', { name: 'Chọn và di chuyển' }).click()
  await page.locator('[data-annotation="rect"] rect').first().click({ position: { x: 3, y: 3 } })
  await page.getByLabel('Tô đặc').check()
  await page.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  const out = await rasterize(await downloadOf(page))
  expect([out.width, out.height]).toEqual([300, 400])
  expect(out.at(out.width * 0.15, out.height * 0.06)[0]).toBeGreaterThan(150) // góc trên-trái nhìn thấy có màu đỏ
  expect(out.at(out.width * 0.85, out.height * 0.9)).toEqual([255, 255, 255])
})
