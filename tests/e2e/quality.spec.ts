import { expect, test, type Page, type Request } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const fx = (n: string) => `tests/fixtures/${n}`
const pick = (page: Page, files: string[]) => page.locator('input[type=file]').setInputFiles(files.map(fx))

async function resetDb(page: Page) {
  await page.goto('/documents/all')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(dbs.map((d) => new Promise((r) => { const q = indexedDB.deleteDatabase(d.name!); q.onsuccess = q.onerror = q.onblocked = () => r(null) })))
  })
  await page.reload()
}

test.describe('SC-005: nội dung tệp không rời khỏi trình duyệt', () => {
  test('qua thư viện và mọi nhóm công cụ không có yêu cầu mạng nào mang dữ liệu hoặc đi ra ngoài', async ({ page, baseURL }) => {
    const requests: Request[] = []
    page.on('request', (r) => { if (/^https?:/.test(r.url())) requests.push(r) })
    await resetDb(page)

    // Thư viện
    await pick(page, ['sample-10p.pdf', 'image-red.png', 'sample.txt'])
    await expect(page.getByText('Đã thêm 3 tệp')).toBeVisible()

    const run = async (url: string, files: string[], button: RegExp | string, prep?: () => Promise<void>) => {
      await page.goto(url)
      await pick(page, files)
      await prep?.()
      await page.getByRole('button', { name: button, exact: typeof button === 'string' }).click()
      await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible()
    }
    await run('/tools/merge', ['sample-1p.pdf', 'sample-10p.pdf'], 'Gộp PDF')
    await run('/tools/protect', ['sample-1p.pdf'], 'Đặt mật khẩu', async () => {
      await page.getByLabel('Mật khẩu', { exact: true }).fill('abc')
      await page.getByLabel('Nhập lại mật khẩu').fill('abc')
    })
    await run('/tools/compress', ['heavy-20p.pdf'], 'Nén PDF')
    await run('/tools/watermark', ['sample-1p.pdf'], 'Thêm hình mờ', async () => {
      await page.getByLabel('Chữ hình mờ').fill('BẢN NHÁP')
    })
    await run('/tools/text-to-pdf', ['vietnamese.txt'], 'Tạo PDF')
    await run('/tools/pdf-to-images', ['sample-10p.pdf'], 'Chuyển sang ảnh')
    await page.goto('/tools/organize-pages')
    await pick(page, ['sample-10p.pdf'])
    await expect(page.getByText('Còn 10 trang')).toBeVisible()

    // Nhóm công cụ mới: ảnh (kể cả AVIF dùng wasm), Office, OCR, sửa PDF, trình chỉnh chú thích/biên tập.
    await run('/tools/image-resize', ['image-wide.png'], 'Đổi kích thước')
    await run('/tools/image-to-avif', ['image-red.png'], 'Chuyển sang AVIF')
    await run('/tools/image-enhance', ['image-tall.jpg'], 'Tăng cường')
    await run('/tools/docx-to-pdf', ['report.docx'], 'Chuyển sang PDF')
    await run('/tools/xlsx-to-pdf', ['table.xlsx'], 'Chuyển sang PDF')
    await run('/tools/pptx-to-pdf', ['deck.pptx'], 'Chuyển sang PDF')
    await run('/tools/pdf-to-docx', ['sample-10p.pdf'], 'Chuyển sang Word')
    await run('/tools/pdf-to-pptx', ['sample-1p.pdf'], 'Chuyển sang PowerPoint')
    await run('/tools/repair', ['damaged-startxref.pdf'], 'Sửa PDF')
    await run('/tools/ocr', ['image-red.png'], 'Nhận dạng chữ', async () => undefined).catch(() => undefined) // ảnh trơn: không có chữ, chỉ cần không rò mạng
    await page.goto('/tools/annotate')
    await pick(page, ['sample-1p.pdf'])
    await expect(page.getByTestId('page-0')).toBeVisible()
    await page.getByRole('button', { name: 'Hình chữ nhật', exact: true }).click()
    const b = (await page.getByTestId('page-0').boundingBox())!
    await page.mouse.move(b.x + 40, b.y + 40)
    await page.mouse.down()
    await page.mouse.move(b.x + 140, b.y + 100, { steps: 4 })
    await page.mouse.up()
    await page.getByRole('button', { name: 'Lưu chú thích' }).click()
    await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible()

    const origin = new URL(baseURL!).origin
    const offenders = requests.filter((r) => new URL(r.url()).origin !== origin || !['GET', 'HEAD'].includes(r.method()) || r.postDataBuffer() !== null)
    expect(offenders.map((r) => `${r.method()} ${r.url()}`)).toEqual([])
    expect(requests.length).toBeGreaterThan(10) // chắc chắn đã thực sự ghi nhận lưu lượng
  })
})

test.describe('SC-002: hiệu năng', () => {
  test('gộp 50 trang dưới 5 giây và luồng chính không bị đơ', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __long: number[] }).__long = []
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) (window as unknown as { __long: number[] }).__long.push(e.duration)
      }).observe({ entryTypes: ['longtask'] })
    })
    await page.goto('/tools/merge')
    await pick(page, Array(5).fill('sample-10p.pdf'))
    await expect(page.getByText('Còn')).toHaveCount(0)
    await page.evaluate(() => ((window as unknown as { __long: number[] }).__long.length = 0))

    const t0 = Date.now()
    await page.getByRole('button', { name: 'Gộp PDF', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible()
    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(5000)

    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long)
    expect(Math.max(0, ...long)).toBeLessThan(200)
  })
})

const widths = [390, 768, 1024, 1440]
test.describe('responsive: không tràn ngang', () => {
  for (const w of widths) {
    test(`${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 })
      await resetDb(page)
      await pick(page, ['sample-1p.pdf', 'sample-10p.pdf'])
      await expect(page.getByText('sample-10p.pdf')).toBeVisible()
      for (const url of ['/documents/all', '/documents/trash', '/images/all', '/tools', '/tools/images', '/tools/convert', '/tools/merge', '/tools/watermark', '/tools/page-numbers', '/tools/image-resize', '/tools/image-crop', '/tools/ocr', '/tools/annotate']) {
        await page.goto(url)
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(over, `${url} tràn ngang ${over}px ở ${w}px`).toBeLessThanOrEqual(0)
      }
    })
  }
})

test.describe('trợ năng (axe, WCAG 2.1 AA)', () => {
  const audit = async (page: Page, label: string) => {
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const summary = res.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
    expect(summary, label).toEqual([])
  }

  test('thư viện: trạng thái rỗng, có tệp, hộp thoại', async ({ page }) => {
    await resetDb(page)
    await audit(page, 'thư viện rỗng')
    await pick(page, ['sample-1p.pdf', 'sample.txt'])
    await expect(page.getByText('sample.txt')).toBeVisible()
    await audit(page, 'thư viện có tệp')
    await page.getByRole('button', { name: 'Thư mục mới' }).click()
    await audit(page, 'hộp thoại thư mục mới')
    await page.keyboard.press('Escape')
    await page.getByLabel('Chọn sample.txt').check()
    await audit(page, 'thanh chọn nhiều')
    await page.goto('/documents/trash')
    await audit(page, 'thùng rác')
  })

  test('danh mục và các trang công cụ', async ({ page }) => {
    await page.goto('/tools')
    await audit(page, 'danh mục')
    await page.goto('/tools/merge')
    await pick(page, ['sample-1p.pdf', 'sample-10p.pdf'])
    await expect(page.getByText('sample-10p.pdf')).toBeVisible()
    await audit(page, 'gộp PDF có tệp')
    await page.goto('/tools/protect')
    await pick(page, ['sample-1p.pdf'])
    await page.getByRole('button', { name: 'Đặt mật khẩu' }).click()
    await expect(page.getByText('Hãy nhập mật khẩu.')).toBeVisible()
    await audit(page, 'form có lỗi')
    await page.goto('/tools/organize-pages')
    await pick(page, ['sample-10p.pdf'])
    await expect(page.getByText('Còn 10 trang')).toBeVisible()
    await audit(page, 'sắp xếp trang')
    await page.goto('/tools/watermark')
    await audit(page, 'hình mờ')
  })

  test('thư viện Hình ảnh, danh mục ảnh và trang Chuyển đổi PDF', async ({ page }) => {
    await resetDb(page)
    await page.goto('/images/all')
    await audit(page, 'thư viện ảnh rỗng')
    await pick(page, ['image-red.png', 'image-blue.jpg'])
    await expect(page.getByText('image-blue.jpg')).toBeVisible()
    await audit(page, 'thư viện ảnh có ảnh')
    await page.goto('/tools/images')
    await audit(page, 'danh mục công cụ ảnh')
    await page.goto('/tools/convert')
    await audit(page, 'chuyển đổi rỗng')
    await pick(page, ['sample-1p.pdf'])
    await expect(page.getByText('PDF sang Word')).toBeVisible()
    await audit(page, 'chuyển đổi có gợi ý')
  })

  test('công cụ ảnh có trình chỉnh: cắt, xóa đối tượng, đổi kích thước', async ({ page }) => {
    for (const [url, file] of [['/tools/image-crop', 'image-red.png'], ['/tools/image-erase', 'image-red.png'], ['/tools/image-resize', 'image-wide.png'], ['/tools/image-enhance', 'image-tall.jpg']] as const) {
      await page.goto(url)
      await pick(page, [file])
      await expect(page.getByText(file)).toBeVisible()
      await audit(page, url)
    }
  })

  test('trình chỉnh PDF (chú thích, ký, biên tập), hộp thoại chữ ký và OCR', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1400 })
    for (const url of ['/tools/annotate', '/tools/edit', '/tools/sign', '/tools/redact']) {
      await page.goto(url)
      await pick(page, ['sample-1p.pdf'])
      await expect(page.getByTestId('page-0')).toBeVisible()
      await audit(page, url)
    }
    // Sửa chữ có sẵn: lớp đoạn chữ bấm được và bảng sửa chữ phải đạt axe.
    await page.goto('/tools/edit')
    await pick(page, ['sample-1p.pdf'])
    await expect(page.getByRole('button', { name: 'Sửa chữ: Sample - page 1/1' })).toBeVisible()
    await audit(page, 'sửa chữ: lớp đoạn chữ')
    await page.getByRole('button', { name: 'Sửa chữ: Sample - page 1/1' }).click()
    await page.getByLabel('Nội dung').fill('Đã sửa')
    await audit(page, 'sửa chữ: bảng sửa')
    await page.goto('/tools/sign')
    await pick(page, ['sample-1p.pdf'])
    await page.getByRole('button', { name: 'Chữ ký', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, 'hộp thoại chữ ký')
    await page.getByRole('dialog').getByRole('tab', { name: 'Gõ' }).click()
    await audit(page, 'hộp thoại chữ ký (gõ)')
    await page.keyboard.press('Escape')
    await page.goto('/tools/ocr')
    await pick(page, ['image-red.png'])
    await audit(page, 'OCR')
  })

  test('tiếng Anh và trang 404', async ({ page }) => {
    await page.goto('/tools')
    await page.getByLabel('Ngôn ngữ').selectOption('en')
    await audit(page, 'danh mục tiếng Anh')
    await page.goto('/khong-co-trang-nay')
    await audit(page, '404')
  })

  test('đối chứng: axe thật sự bắt được lỗi trợ năng được cố tình chèn vào', async ({ page }) => {
    await page.goto('/tools')
    await expect(page.getByRole('heading', { name: 'Công cụ', level: 1 })).toBeVisible()
    await page.evaluate(() => {
      document.querySelector('main')!.insertAdjacentHTML(
        'beforeend',
        '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><button></button><p style="color:#bbb;background:#fff">chữ nhạt</p>',
      )
    })
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const ids = res.violations.map((v) => v.id)
    expect(ids).toEqual(expect.arrayContaining(['image-alt', 'button-name', 'color-contrast']))
  })

  test('bàn phím: skip link và vòng focus nhìn thấy', async ({ page }) => {
    await page.goto('/tools')
    const skip = page.getByRole('link', { name: 'Bỏ qua điều hướng' })
    await expect(skip).toBeAttached() // ứng dụng chỉ vẽ sau khi kho lưu trữ mở xong
    await page.keyboard.press('Tab')
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()
    const ring = await skip.evaluate((el) => {
      const s = getComputedStyle(el)
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }
    })
    expect(ring.style).not.toBe('none')
    expect(ring.width).toBeGreaterThanOrEqual(2)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#main$/)
  })
})

test('SC-001: người mới đi từ trang chủ đến kết quả gộp 2 PDF trong dưới 30 giây', async ({ page }) => {
  await resetDb(page)
  const t0 = Date.now()
  await page.goto('/')
  await page.getByRole('link', { name: 'Công cụ' }).first().click()
  await page.getByRole('link', { name: /Gộp PDF/ }).click()
  await pick(page, ['sample-1p.pdf', 'sample-10p.pdf'])
  await page.getByRole('button', { name: 'Gộp PDF', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible()
  expect(Date.now() - t0).toBeLessThan(30_000)
})

test('FR-008: dùng tệp trong thư viện làm đầu vào không bao giờ ghi đè bản gốc; kết quả là tệp mới', async ({ page }) => {
  await resetDb(page)
  await pick(page, ['sample-10p.pdf'])
  await expect(page.getByText('sample-10p.pdf')).toBeVisible()
  const sizeBefore = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('make-it-easier'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    return await new Promise<number[]>((res) => { const q = db.transaction('documents').objectStore('documents').getAll(); q.onsuccess = () => res(q.result.map((d: { size: number }) => d.size)) })
  })

  await page.goto('/tools/rotate-pages')
  await page.getByRole('button', { name: 'Thêm từ thư viện' }).click()
  await page.getByRole('dialog').getByLabel(/sample-10p\.pdf/).check()
  await page.getByRole('button', { name: 'Thêm đã chọn' }).click()
  await page.getByRole('button', { name: 'Xoay trang', exact: true }).click()
  await page.getByLabel('Tên tệp kết quả').fill('sample-10p')
  await page.getByRole('button', { name: 'Lưu vào thư viện' }).click()
  await expect(page.getByRole('button', { name: 'Đã lưu vào thư viện' })).toBeDisabled()

  await page.goto('/documents/all')
  // Tên trùng nên kết quả được thêm hậu tố, bản gốc giữ nguyên tên và dung lượng.
  await expect(page.getByText('sample-10p.pdf', { exact: true })).toBeVisible()
  await expect(page.getByText('sample-10p (2).pdf')).toBeVisible()
  const sizes = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('make-it-easier'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    return await new Promise<{ name: string; size: number }[]>((res) => { const q = db.transaction('documents').objectStore('documents').getAll(); q.onsuccess = () => res(q.result.map((d: { name: string; size: number }) => ({ name: d.name, size: d.size }))) })
  })
  expect(sizes.find((d) => d.name === 'sample-10p.pdf')!.size).toBe(sizeBefore[0])
  expect(sizes).toHaveLength(2)
})
