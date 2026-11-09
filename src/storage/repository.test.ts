import { beforeEach, describe, expect, it } from 'vitest'
import { openLibraryDb } from './db'
import { createRepository, withSuffix, type Repository } from './repository'

let repo: Repository
let n = 0

const bytes = (s: string) => new TextEncoder().encode(s)

beforeEach(async () => {
  repo = createRepository(await openLibraryDb(`test-${n++}-${Math.random()}`))
})

describe('withSuffix', () => {
  it('đặt hậu tố trước phần mở rộng', () => {
    expect(withSuffix('a.pdf', 2)).toBe('a (2).pdf')
    expect(withSuffix('readme', 3)).toBe('readme (3)')
    expect(withSuffix('.hidden', 2)).toBe('.hidden (2)')
  })
})

describe('documents', () => {
  it('lưu và đọc lại nội dung nguyên vẹn', async () => {
    const d = await repo.createDocument({ name: 'a.txt', mime: 'text/plain', data: bytes('xin chào') })
    expect(d.size).toBe(bytes('xin chào').byteLength)
    expect(new TextDecoder().decode(await repo.getBytes(d.id))).toBe('xin chào')
  })

  it('tên trùng trong cùng thư mục tự thêm hậu tố, thư mục khác thì không', async () => {
    const a = await repo.createDocument({ name: 'a.pdf', mime: 'application/pdf', data: bytes('1') })
    const b = await repo.createDocument({ name: 'a.pdf', mime: 'application/pdf', data: bytes('2') })
    const folder = await repo.createFolder('F')
    const c = await repo.createDocument({
      name: 'a.pdf',
      mime: 'application/pdf',
      data: bytes('3'),
      folderId: folder.id,
    })
    expect([a.name, b.name, c.name]).toEqual(['a.pdf', 'a (2).pdf', 'a.pdf'])
  })

  it('xóa mềm đưa vào thùng rác, khôi phục trả lại, xóa vĩnh viễn gỡ cả nội dung', async () => {
    const d = await repo.createDocument({ name: 'a.txt', mime: 'text/plain', data: bytes('x') })
    await repo.softDeleteDocument(d.id)
    expect(await repo.listDocuments({ view: 'all' })).toHaveLength(0)
    expect(await repo.listDocuments({ view: 'trash' })).toHaveLength(1)

    await repo.restoreDocument(d.id)
    expect(await repo.listDocuments({ view: 'all' })).toHaveLength(1)

    await repo.softDeleteDocument(d.id)
    await repo.purgeDocument(d.id)
    expect(await repo.getDocument(d.id)).toBeUndefined()
    await expect(repo.getBytes(d.id)).rejects.toThrow()
  })

  it('khôi phục khi tên đã bị file khác chiếm thì đổi hậu tố', async () => {
    const a = await repo.createDocument({ name: 'a.txt', mime: 'text/plain', data: bytes('1') })
    await repo.softDeleteDocument(a.id)
    await repo.createDocument({ name: 'a.txt', mime: 'text/plain', data: bytes('2') })
    const restored = await repo.restoreDocument(a.id)
    expect(restored.name).toBe('a (2).txt')
  })

  it('yêu thích và tab Yêu thích', async () => {
    const a = await repo.createDocument({ name: 'a.txt', mime: 'text/plain', data: bytes('1') })
    await repo.createDocument({ name: 'b.txt', mime: 'text/plain', data: bytes('2') })
    await repo.setFavorite(a.id, true)
    const fav = await repo.listDocuments({ view: 'favorites' })
    expect(fav.map((d) => d.name)).toEqual(['a.txt'])
  })

  it('Gần đây sắp theo lần sửa cuối, mới nhất trước', async () => {
    const a = await repo.createDocument({ name: 'a.txt', mime: 'text/plain', data: bytes('1') })
    await new Promise((r) => setTimeout(r, 5))
    await repo.createDocument({ name: 'b.txt', mime: 'text/plain', data: bytes('2') })
    await new Promise((r) => setTimeout(r, 5))
    await repo.renameDocument(a.id, 'a2.txt')
    const recent = await repo.listDocuments({ view: 'recent' })
    expect(recent.map((d) => d.name)).toEqual(['a2.txt', 'b.txt'])
  })

  it('tìm theo tên không phân biệt hoa thường, trên toàn thư viện', async () => {
    const f = await repo.createFolder('F')
    await repo.createDocument({ name: 'Báo cáo.pdf', mime: 'application/pdf', data: bytes('1'), folderId: f.id })
    await repo.createDocument({ name: 'other.txt', mime: 'text/plain', data: bytes('2') })
    const hit = await repo.listDocuments({ view: 'all', query: 'BÁO' })
    expect(hit.map((d) => d.name)).toEqual(['Báo cáo.pdf'])
  })

  it('di chuyển vào thư mục', async () => {
    const f = await repo.createFolder('F')
    const d = await repo.createDocument({ name: 'a.txt', mime: 'text/plain', data: bytes('1') })
    await repo.moveDocument(d.id, f.id)
    expect(await repo.listDocuments({ view: 'all' })).toHaveLength(0)
    expect(await repo.listDocuments({ view: 'all', folderId: f.id })).toHaveLength(1)
  })
})

describe('folders', () => {
  it('lồng nhau, có breadcrumb', async () => {
    const a = await repo.createFolder('A')
    const b = await repo.createFolder('B', a.id)
    expect((await repo.folderPath(b.id)).map((f) => f.name)).toEqual(['A', 'B'])
    expect((await repo.listFolders(a.id)).map((f) => f.name)).toEqual(['B'])
  })

  it('không cho di chuyển thư mục vào chính nó hoặc con cháu', async () => {
    const a = await repo.createFolder('A')
    const b = await repo.createFolder('B', a.id)
    await expect(repo.moveFolder(a.id, b.id)).rejects.toThrow()
    await expect(repo.moveFolder(a.id, a.id)).rejects.toThrow()
  })

  it('xóa mềm thư mục kéo theo tài liệu và thư mục con', async () => {
    const a = await repo.createFolder('A')
    const b = await repo.createFolder('B', a.id)
    await repo.createDocument({ name: 'x.txt', mime: 'text/plain', data: bytes('1'), folderId: b.id })
    await repo.softDeleteFolder(a.id)
    expect(await repo.listFolders(null)).toHaveLength(0)
    expect(await repo.listDocuments({ view: 'trash' })).toHaveLength(1)
  })

  it('đổi tên trùng thì thêm hậu tố', async () => {
    await repo.createFolder('A')
    const b = await repo.createFolder('B')
    expect((await repo.renameFolder(b.id, 'A')).name).toBe('A (2)')
  })
})

describe('thư mục: cây và dọn rác', () => {
  it('listFolderTree trả đường dẫn đầy đủ', async () => {
    const a = await repo.createFolder('A')
    await repo.createFolder('B', a.id)
    expect((await repo.listFolderTree()).map((x) => x.path)).toEqual(['A', 'A / B'])
  })

  it('dọn thùng rác xóa vĩnh viễn tài liệu và thư mục đã xóa', async () => {
    const f = await repo.createFolder('A')
    await repo.createDocument({ name: 'x.txt', mime: 'text/plain', data: bytes('1'), folderId: f.id })
    await repo.softDeleteFolder(f.id)
    await repo.emptyTrash()
    expect(await repo.listDocuments({ view: 'trash' })).toHaveLength(0)
    expect(await repo.getFolder(f.id)).toBeUndefined()
  })
})

describe('kind: ảnh và tài liệu tách riêng', () => {
  it('lọc theo loại, giữ nguyên các view', async () => {
    await repo.createDocument({ name: 'a.pdf', mime: 'application/pdf', data: bytes('1') })
    const img = await repo.createDocument({ name: 'b.png', mime: 'image/png', data: bytes('2') })
    expect((await repo.listDocuments({ view: 'all', kind: 'files' })).map((d) => d.name)).toEqual(['a.pdf'])
    expect((await repo.listDocuments({ view: 'all', kind: 'images' })).map((d) => d.name)).toEqual(['b.png'])
    expect(await repo.listDocuments({ view: 'all' })).toHaveLength(2)
    await repo.softDeleteDocument(img.id)
    expect((await repo.listDocuments({ view: 'trash', kind: 'images' })).map((d) => d.name)).toEqual(['b.png'])
    expect(await repo.listDocuments({ view: 'trash', kind: 'files' })).toHaveLength(0)
  })
})
