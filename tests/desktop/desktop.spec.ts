import { mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

// MIE_PACKAGED=release/linux-unpacked/make-it-easier: kiểm thử bản đã đóng gói thay vì chạy từ mã nguồn.
const packaged = process.env.MIE_PACKAGED
const launch = (userData: string) =>
  electron.launch({ ...(packaged ? { executablePath: resolve(packaged), args: [] } : { args: [resolve('.')] }), env: { ...process.env, MIE_USER_DATA: userData, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } })

test('app máy tính: dữ liệu lưu trong SQLite + tệp thật, còn nguyên sau khi mở lại; có xem trước; công cụ chạy', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'mie-e2e-'))
  let app: ElectronApplication | undefined
  try {
    app = await launch(userData)
    let page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    expect(page.url()).toMatch(/^app:\/\/local\//)
    expect(await page.evaluate(() => typeof window.desktop?.store)).toBe('function')
    // renderer không có quyền Node
    expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined')

    await page.goto('app://local/documents/all')
    await page.locator('input[type=file]').first().setInputFiles(['tests/fixtures/sample-10p.pdf'])
    await expect(page.getByRole('button', { name: 'Xem trước sample-10p.pdf' })).toBeVisible()
    expect(existsSync(join(userData, 'library.sqlite'))).toBe(true)
    expect(readdirSync(join(userData, 'blobs'))).toHaveLength(1)

    // xem trước: pdf.js + worker + wasm chạy được dưới giao thức app://
    await page.getByRole('button', { name: 'Xem trước sample-10p.pdf' }).click()
    const img = page.getByRole('dialog', { name: 'sample-10p.pdf' }).getByRole('img', { name: 'Trang 1' })
    await expect(img).toBeVisible()
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 100)).toBe(true)
    await page.keyboard.press('Escape')

    // mở lại ứng dụng với cùng thư mục dữ liệu
    await app.close()
    app = await launch(userData)
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.goto('app://local/documents/all')
    await expect(page.getByRole('button', { name: 'Xem trước sample-10p.pdf' })).toBeVisible()

    // một công cụ chạy đầy đủ trong app (worker + pdf-lib): tách trang
    await page.goto('app://local/tools/split')
    await page.locator('input[type=file]').first().setInputFiles(['tests/fixtures/sample-10p.pdf'])
    await expect(page.getByRole('button', { name: /Tách PDF/ }).first()).toBeEnabled()
  } finally {
    await app?.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
  }
})

test('cài đặt: hiện phiên bản, thư mục dữ liệu; kiểm tra bản mới thấy bản cao hơn từ máy chủ cập nhật và báo nâng cấp', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'mie-e2e-'))
  const feed = createServer((req, res) => {
    // electron-updater đọc latest*.yml (tùy nền tảng); trả về bản 9.9.9
    if (/latest[^/]*\.yml$/.test((req.url ?? '').split('?')[0]!)) {
      res.setHeader('content-type', 'text/yaml')
      res.end(`version: 9.9.9\nfiles:\n  - url: make-it-easier-9.9.9.bin\n    sha512: ${'A'.repeat(86)}==\n    size: 100\npath: make-it-easier-9.9.9.bin\nsha512: ${'A'.repeat(86)}==\nreleaseDate: '2026-11-10T00:00:00.000Z'\n`)
    } else {
      res.statusCode = 404
      res.end()
    }
  })
  await new Promise<void>((r) => feed.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${(feed.address() as { port: number }).port}`
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({ args: [resolve('.')], env: { ...process.env, MIE_USER_DATA: userData, MIE_UPDATE_URL: url, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.goto('app://local/settings')
    await expect(page.getByText(/Phiên bản đang dùng: \d+\.\d+\.\d+/)).toBeVisible()
    await expect(page.getByText(userData)).toBeVisible()
    await page.getByRole('button', { name: 'Kiểm tra bản mới' }).click()
    await expect(page.getByText('Có bản mới: 9.9.9.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Nâng cấp lên 9\.9\.9|Mở trang tải về/ })).toBeVisible()
  } finally {
    await app?.close().catch(() => {})
    feed.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
