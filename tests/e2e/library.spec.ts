import { expect, test } from '@playwright/test'

const fx = (n: string) => `tests/fixtures/${n}`
const upload = (page: import('@playwright/test').Page, files: string[]) =>
  page.locator('input[type=file]').setInputFiles(files.map(fx))

test.beforeEach(async ({ page }) => {
  await page.goto('/documents/all')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(dbs.map((d) => new Promise((r) => { const q = indexedDB.deleteDatabase(d.name!); q.onsuccess = q.onerror = q.onblocked = () => r(null) })))
  })
  await page.reload()
})

test('trạng thái rỗng, tải 3 tệp, tải lại trang vẫn còn', async ({ page }) => {
  await expect(page.getByText('Bạn chưa thêm tài liệu nào')).toBeVisible()
  await upload(page, ['sample-1p.pdf', 'sample-10p.pdf', 'image-red.png'])
  await expect(page.getByText('Đã thêm 3 tệp')).toBeVisible()
  await expect(page.getByText('1 ảnh đã được thêm vào thư viện Hình ảnh')).toBeVisible()
  await expect(page.getByText('sample-10p.pdf')).toBeVisible()
  await expect(page.getByText('10 trang')).toBeVisible()
  await expect(page.getByText('image-red.png')).toHaveCount(0) // ảnh nằm ở thư viện Hình ảnh
  await page.reload()
  await expect(page.getByText('sample-10p.pdf')).toBeVisible()
  await page.getByRole('link', { name: 'Tất cả ảnh' }).click()
  await expect(page.getByText('image-red.png')).toBeVisible()
})

test('PDF hỏng bị từ chối rõ ràng, tệp khác vẫn được thêm', async ({ page }) => {
  await upload(page, ['corrupt.pdf', 'sample-1p.pdf'])
  await expect(page.getByRole('alert')).toContainText('corrupt.pdf')
  await expect(page.getByText('sample-1p.pdf')).toBeVisible()
  await expect(page.getByText('corrupt.pdf', { exact: true })).toHaveCount(0)
})

test('thư mục: tạo, vào, breadcrumb, di chuyển tệp vào thư mục', async ({ page }) => {
  await upload(page, ['sample-1p.pdf'])
  await page.getByRole('button', { name: 'Thư mục mới' }).click()
  await page.getByLabel('Tên thư mục').fill('Hợp đồng')
  await page.getByRole('button', { name: 'Tạo' }).click()
  await expect(page.getByRole('button', { name: 'Hợp đồng', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Di chuyển: sample-1p.pdf' }).click()
  await page.getByRole('radio', { name: 'Hợp đồng' }).check()
  await page.getByRole('button', { name: 'Di chuyển vào đây' }).click()
  await expect(page.getByText('sample-1p.pdf')).toHaveCount(0)

  await page.getByRole('button', { name: 'Hợp đồng', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hợp đồng', level: 1 })).toBeVisible()
  await expect(page.getByText('sample-1p.pdf')).toBeVisible()
  await page.getByRole('button', { name: 'Tài liệu', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Hợp đồng', exact: true })).toBeVisible()
})

test('yêu thích, xóa vào thùng rác, khôi phục, xóa vĩnh viễn', async ({ page }) => {
  await upload(page, ['sample-1p.pdf', 'sample.txt'])
  await page.getByRole('button', { name: 'Yêu thích sample.txt' }).click()
  await page.locator('a[href="/documents/favorites"]').first().click()
  await expect(page.getByText('sample.txt')).toBeVisible()
  await expect(page.getByText('sample-1p.pdf')).toHaveCount(0)

  await page.locator('a[href="/documents/all"]').first().click()
  await page.getByRole('button', { name: 'Xóa sample-1p.pdf' }).click()
  await expect(page.getByText('sample-1p.pdf')).toHaveCount(0)

  await page.locator('a[href="/documents/trash"]').first().click()
  await page.getByRole('button', { name: 'Khôi phục sample-1p.pdf' }).click()
  await expect(page.getByText('Thùng rác trống')).toBeVisible()
  await page.locator('a[href="/documents/all"]').first().click()
  await expect(page.getByText('sample-1p.pdf')).toBeVisible()

  await page.getByRole('button', { name: 'Xóa sample-1p.pdf' }).click()
  await page.locator('a[href="/documents/trash"]').first().click()
  await page.getByRole('button', { name: 'Xóa vĩnh viễn sample-1p.pdf' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Xóa vĩnh viễn' }).click()
  await expect(page.getByText('Thùng rác trống')).toBeVisible()
})

test('tìm kiếm lọc theo tên, tab Gần đây có file mới nhất đầu tiên, đổi tên và tên trùng', async ({ page }) => {
  await upload(page, ['sample-1p.pdf', 'sample.txt'])
  await page.getByLabel('Tìm kiếm thư mục hoặc tập tin').fill('1p')
  await expect(page.getByText('sample-1p.pdf')).toBeVisible()
  await expect(page.getByText('sample.txt')).toHaveCount(0)
  await page.getByLabel('Tìm kiếm thư mục hoặc tập tin').fill('khongco')
  await expect(page.getByText('Không tìm thấy kết quả')).toBeVisible()
  await page.getByLabel('Tìm kiếm thư mục hoặc tập tin').fill('')

  await page.getByRole('button', { name: 'Đổi tên: sample.txt' }).click()
  await page.getByLabel('Tên mới').fill('sample-1p.pdf')
  await page.getByRole('button', { name: 'Lưu' }).click()
  await expect(page.getByText('sample-1p (2).pdf')).toBeVisible()

  await page.locator('a[href="/documents/recent"]').first().click()
  const first = page.getByRole('listitem').first()
  await expect(first).toContainText('sample-1p (2).pdf')
})

test('chọn nhiều và xóa hàng loạt', async ({ page }) => {
  await upload(page, ['sample-1p.pdf', 'sample.txt', 'vietnamese.txt'])
  await page.getByLabel('Chọn sample.txt').check()
  await page.getByLabel('Chọn vietnamese.txt').check()
  await expect(page.getByText('Đã chọn 2 mục')).toBeVisible()
  await page.getByRole('button', { name: 'Xóa', exact: true }).click()
  await expect(page.getByText('sample.txt')).toHaveCount(0)
  await expect(page.getByText('sample-1p.pdf')).toBeVisible()
})

test('thư viện Hình ảnh: rỗng, chỉ nhận ảnh, Gần đây, xóa và khôi phục', async ({ page }) => {
  await page.goto('/images/all')
  await expect(page.getByText('Bạn chưa thêm hình ảnh nào')).toBeVisible()
  await upload(page, ['image-red.png', 'image-blue.jpg', 'sample.txt'])
  await expect(page.getByText('Đã thêm 2 tệp')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('sample.txt')
  await expect(page.getByRole('alert')).toContainText('chỉ nhận ảnh')
  await expect(page.getByText('image-red.png')).toBeVisible()
  await expect(page.getByText('image-blue.jpg')).toBeVisible()
  await expect(page.getByRole('button', { name: /Yêu thích/ })).toHaveCount(0)

  await page.locator('a[href="/images/recent"]').first().click()
  await expect(page.getByRole('listitem').first()).toContainText('image-blue.jpg')

  await page.getByRole('button', { name: 'Xóa image-blue.jpg' }).click()
  await page.locator('a[href="/images/trash"]').first().click()
  await expect(page.getByText('image-blue.jpg')).toBeVisible()
  await page.getByRole('button', { name: 'Khôi phục image-blue.jpg' }).click()
  await expect(page.getByText('Thùng rác trống')).toBeVisible()
  await page.goto('/documents/all')
  await expect(page.getByText('Bạn chưa thêm tài liệu nào')).toBeVisible() // ảnh không lẫn vào Tài liệu
})
