import { readFileSync } from 'node:fs'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { expect, test, type Page } from '@playwright/test'

const fx = (n: string) => `tests/fixtures/${n}`
type Payload = { name: string; mimeType: string; buffer: Buffer }
const pick = (page: Page, files: string[] | Payload[]) =>
  page.locator('input[type=file]').setInputFiles((files as (string | Payload)[]).map((f) => (typeof f === 'string' ? fx(f) : f)) as string[] | Payload[])

async function downloadOf(page: Page, name: string | RegExp = 'Tải về') {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).first().click()])
  return { bytes: readFileSync((await d.path())!), filename: d.suggestedFilename() }
}
async function pixels(bytes: Buffer) {
  const img = await loadImage(bytes)
  const c = createCanvas(img.width, img.height)
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  return { width: img.width, height: img.height, at: (x: number, y: number) => [...g.getImageData(x, y, 1, 1).data] }
}
/** PNG tổng hợp: nền `bg`, hình vuông `fg` ở giữa. */
function squarePng(w: number, h: number, bg: string, fg: string) {
  const c = createCanvas(w, h)
  const g = c.getContext('2d')
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  g.fillStyle = fg
  g.fillRect(w * 0.35, h * 0.35, w * 0.3, h * 0.3)
  return { name: 'square.png', mimeType: 'image/png', buffer: c.toBuffer('image/png') }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/documents/all')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(dbs.map((d) => new Promise((r) => { const q = indexedDB.deleteDatabase(d.name!); q.onsuccess = q.onerror = q.onblocked = () => r(null) })))
  })
})

test('danh mục công cụ ảnh: 13 công cụ, lọc theo nhóm, tìm kiếm, tách khỏi công cụ PDF', async ({ page }) => {
  await page.goto('/tools/images')
  await expect(page.getByRole('heading', { name: 'Công cụ ảnh', level: 1 })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ has: page.getByRole('link') })).toHaveCount(13)
  await expect(page.getByRole('link', { name: /Gộp PDF/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Đổi định dạng', exact: true }).click()
  await expect(page.getByRole('link', { name: /Ảnh sang AVIF/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Cắt ảnh/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Tất cả công cụ' }).click()
  await page.getByLabel('Tìm công cụ').fill('nền')
  await expect(page.getByRole('link', { name: /Xóa nền ảnh/ })).toBeVisible()
  await page.goto('/tools')
  await expect(page.getByRole('link', { name: /Cắt ảnh/ })).toHaveCount(0)
  await page.locator('a[href="/tools/images"]').first().click()
  await expect(page).toHaveURL(/\/tools\/images$/)
})

test('đổi kích thước 50%: đúng kích thước và tên tệp', async ({ page }) => {
  await page.goto('/tools/image-resize')
  await pick(page, ['image-wide.png'])
  await page.getByRole('button', { name: 'Đổi kích thước', exact: true }).click()
  const { bytes, filename } = await downloadOf(page)
  expect(filename).toBe('image-wide-resized.png')
  const p = await pixels(bytes)
  expect([p.width, p.height]).toEqual([320, 120])
})

test('đổi định dạng sang WebP, TIFF, AVIF: đúng chữ ký tệp', async ({ page }) => {
  for (const [id, action, check] of [
    ['image-to-webp', 'Chuyển sang WebP', (b: Buffer) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'],
    ['image-to-tiff', 'Chuyển sang TIFF', (b: Buffer) => (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d)],
    ['image-to-avif', 'Chuyển sang AVIF', (b: Buffer) => b.subarray(4, 8).toString() === 'ftyp'],
  ] as const) {
    await page.goto(`/tools/${id}`)
    await pick(page, ['image-red.png'])
    await page.getByRole('button', { name: action, exact: true }).click()
    const { bytes, filename } = await downloadOf(page)
    expect(check(bytes), id).toBe(true)
    expect(filename.startsWith('image-red.'), id).toBe(true)
  }
})

test('cắt ảnh: nhập số và kéo khung đều cập nhật, kết quả đúng kích thước', async ({ page }) => {
  await page.goto('/tools/image-crop')
  await pick(page, ['image-red.png'])
  await expect(page.getByLabel('Rộng (px)')).toHaveValue('320')
  await page.getByLabel('Rộng (px)').fill('100')
  await page.getByLabel('Cao (px)').fill('50')
  const box = page.getByTestId('crop-box')
  const b = await box.boundingBox()
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2)
  await page.mouse.down()
  await page.mouse.move(b!.x + b!.width / 2 + 60, b!.y + b!.height / 2 + 30, { steps: 5 })
  await page.mouse.up()
  expect(Number(await page.getByLabel('Cách trái (px)').inputValue())).toBeGreaterThan(20)
  expect(Number(await page.getByLabel('Cách trên (px)').inputValue())).toBeGreaterThan(5)
  await page.getByRole('button', { name: 'Cắt ảnh', exact: true }).click()
  const p = await pixels((await downloadOf(page)).bytes)
  expect([p.width, p.height]).toEqual([100, 50])
})

test('xoay 90° đổi chiều ảnh', async ({ page }) => {
  await page.goto('/tools/image-rotate')
  await pick(page, ['image-wide.png'])
  await page.getByRole('button', { name: 'Xoay ảnh', exact: true }).click()
  const p = await pixels((await downloadOf(page)).bytes)
  expect([p.width, p.height]).toEqual([240, 640])
})

test('xóa nền: nền trắng thành trong suốt, chủ thể giữ nguyên', async ({ page }) => {
  await page.goto('/tools/image-remove-bg')
  await pick(page, [squarePng(100, 100, '#ffffff', '#c81e1e')])
  await page.getByRole('button', { name: 'Xóa nền', exact: true }).click()
  const { bytes, filename } = await downloadOf(page)
  expect(filename).toBe('square-no-bg.png')
  const p = await pixels(bytes)
  expect(p.at(2, 2)[3]).toBe(0)
  expect(p.at(50, 50)).toEqual([200, 30, 30, 255])
})

test('xóa đối tượng: nút khóa đến khi tô; tô lên vật thể thì được vá bằng màu nền', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1500 }) // canvas nằm trọn trong khung nhìn để chuột tô được
  await page.goto('/tools/image-erase')
  await pick(page, [squarePng(120, 120, '#1e5aa0', '#e11d48')])
  const run = page.getByRole('button', { name: 'Xóa vùng đã tô' })
  await expect(run).toBeDisabled()
  await expect(page.getByText('Hãy tô lên vùng cần xóa trước.')).toBeVisible()

  const canvas = page.getByTestId('mask-canvas')
  await expect(canvas).toBeVisible()
  const b = (await canvas.boundingBox())!
  // vật thể nằm ở 35%..65% mỗi chiều; quét cọ lớn qua vùng đó
  await page.getByLabel(/Cỡ cọ/).fill('60')
  // Quét zig-zag phủ kín hình vuông (35%..65%); cọ 60px màn hình ≈ 11px ảnh gốc nên mỗi hàng phủ một dải.
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.36)
  await page.mouse.down()
  for (const fy of [0.36, 0.43, 0.5, 0.57, 0.64]) {
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * fy, { steps: 3 })
    await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * fy, { steps: 8 })
  }
  await page.mouse.up()
  await expect(run).toBeEnabled()
  await run.click()

  const p = await pixels((await downloadOf(page)).bytes)
  const [r, g, bl] = p.at(60, 60)!
  expect(Math.abs(r! - 30)).toBeLessThan(25)
  expect(Math.abs(g! - 90)).toBeLessThan(25)
  expect(Math.abs(bl! - 160)).toBeLessThan(25)
})

test('xóa đối tượng: nút Xóa vùng tô khóa lại nút chạy', async ({ page }) => {
  await page.goto('/tools/image-erase')
  await pick(page, ['image-red.png'])
  const canvas = page.getByTestId('mask-canvas')
  const b = (await canvas.boundingBox())!
  await page.mouse.move(b.x + 40, b.y + 40)
  await page.mouse.down()
  await page.mouse.move(b.x + 80, b.y + 60, { steps: 4 })
  await page.mouse.up()
  const run = page.getByRole('button', { name: 'Xóa vùng đã tô' })
  await expect(run).toBeEnabled()
  await page.getByRole('button', { name: 'Xóa vùng tô' }).click()
  await expect(run).toBeDisabled()
})

test('nén ảnh: hiện dung lượng trước/sau; ảnh đã nhỏ nhất thì báo không giảm được', async ({ page }) => {
  const c = createCanvas(300, 200)
  const g = c.getContext('2d')
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgb(${(i * 53) % 256},${(i * 97) % 256},${(i * 193) % 256})`
    g.fillRect((i * 37) % 300, (i * 91) % 200, 12, 9)
  }
  const jpg = { name: 'noisy.jpg', mimeType: 'image/jpeg', buffer: c.toBuffer('image/jpeg', 98) }
  await page.goto('/tools/image-compress')
  await pick(page, [jpg])
  await page.getByLabel('Chất lượng (1–100)').fill('25')
  await page.getByRole('button', { name: 'Nén ảnh', exact: true }).click()
  await expect(page.getByText(/Dung lượng: .* → .* \(giảm \d+%\)/)).toBeVisible()
  expect((await downloadOf(page)).filename).toBe('noisy-compressed.jpg')

  const tiny = { name: 'tiny.png', mimeType: 'image/png', buffer: createCanvas(1, 1).toBuffer('image/png') }
  await page.goto('/tools/image-compress')
  await pick(page, [tiny])
  await page.getByRole('button', { name: 'Nén ảnh', exact: true }).click()
  await expect(page.getByText('không giảm thêm được dung lượng')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toHaveCount(0)
})

test('tăng cường 2×: ảnh ra gấp đôi kích thước', async ({ page }) => {
  await page.goto('/tools/image-enhance')
  await pick(page, ['image-tall.jpg'])
  await page.getByRole('button', { name: 'Tăng cường', exact: true }).click()
  const p = await pixels((await downloadOf(page)).bytes)
  expect([p.width, p.height]).toEqual([400, 800])
})

test('lấy ảnh từ thư viện Hình ảnh; ảnh hỏng báo lỗi rõ; tệp sai loại bị bỏ qua', async ({ page }) => {
  await page.goto('/images/all')
  await pick(page, ['image-red.png', 'image-blue.jpg'])
  await expect(page.getByText('image-blue.jpg')).toBeVisible()
  await page.goto('/tools/image-rotate')
  await page.getByRole('button', { name: 'Thêm từ thư viện' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel(/image-red\.png/)).toBeVisible()
  await dialog.getByLabel(/image-red\.png/).check()
  await page.getByRole('button', { name: 'Thêm đã chọn' }).click()
  await page.getByRole('button', { name: 'Xoay ảnh', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible()

  await page.goto('/tools/image-resize')
  await pick(page, [{ name: 'hong.png', mimeType: 'image/png', buffer: Buffer.from('không phải ảnh') }])
  await page.getByRole('button', { name: 'Đổi kích thước', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('không đọc được')
  await pick(page, ['sample.txt'])
  await expect(page.getByText('Bỏ qua 1 tệp không đúng loại.')).toBeVisible()
})
