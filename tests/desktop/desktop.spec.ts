import { mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
