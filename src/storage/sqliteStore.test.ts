// @vitest-environment node
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openStore, runCommand, type SqliteStore } from '../../electron/store.mjs'
import { desktopStore } from './desktopStore'
import { createRepository } from './repository'

let dir: string
let sqlite: SqliteStore
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mie-'))
  sqlite = openStore(dir)
})
afterEach(() => {
  sqlite.close()
  rmSync(dir, { recursive: true, force: true })
})

// Repository thật chạy trên SQLite qua đúng đường IPC (cầu nối giả gọi runCommand như tiến trình chính).
const repoOver = (s: SqliteStore) =>
  createRepository(desktopStore({ platform: 'test', store: async (m, a) => runCommand(s, m, a) }))

describe('kho SQLite của app máy tính', () => {
  it('tạo tài liệu: siêu dữ liệu trong SQLite, nội dung là tệp thật, đọc lại đúng byte', async () => {
    const repo = repoOver(sqlite)
    const bytes = new Uint8Array([1, 2, 3, 250, 251])
    const doc = await repo.createDocument({ name: 'a.pdf', mime: 'application/pdf', data: bytes })
    expect(readdirSync(join(dir, 'blobs'))).toEqual([doc.blobId])
    expect([...(await repo.getBytes(doc.id))]).toEqual([...bytes])
    expect((await repo.listDocuments({ view: 'all' })).map((d) => d.name)).toEqual(['a.pdf'])
  })

  it('dữ liệu còn nguyên sau khi đóng và mở lại kho', async () => {
    const doc = await repoOver(sqlite).createDocument({ name: 'keep.txt', mime: 'text/plain', data: new TextEncoder().encode('xin chào') })
    sqlite.close()
    sqlite = openStore(dir)
    const repo = repoOver(sqlite)
    expect((await repo.listDocuments({ view: 'all' })).map((d) => d.id)).toEqual([doc.id])
    expect(new TextDecoder().decode(await repo.getBytes(doc.id))).toBe('xin chào')
  })

  it('cùng logic thư viện: tên trùng, thư mục, xóa mềm, khôi phục, xóa vĩnh viễn xóa cả tệp', async () => {
    const repo = repoOver(sqlite)
    const a = await repo.createDocument({ name: 'x.pdf', mime: 'application/pdf', data: new Uint8Array([1]) })
    const b = await repo.createDocument({ name: 'x.pdf', mime: 'application/pdf', data: new Uint8Array([2]) })
    expect(b.name).toBe('x (2).pdf')
    const f = await repo.createFolder('Hồ sơ')
    await repo.moveDocument(a.id, f.id)
    expect((await repo.listDocuments({ view: 'all', folderId: f.id })).map((d) => d.id)).toEqual([a.id])
    await repo.softDeleteFolder(f.id)
    expect(await repo.listDocuments({ view: 'trash' })).toHaveLength(1)
    await repo.restoreDocument(a.id)
    expect((await repo.getDocument(a.id))!.folderId).toBeNull() // thư mục cha đã xóa: về gốc
    await repo.softDeleteDocument(b.id)
    await repo.emptyTrash()
    expect(readdirSync(join(dir, 'blobs'))).toEqual([a.blobId])
  })

  it('từ chối id tệp không hợp lệ (chống đi ra ngoài thư mục dữ liệu) và phương thức lạ', () => {
    expect(runCommand(sqlite, 'get', ['blobs', '../../etc/passwd']).ok).toBe(false)
    expect(runCommand(sqlite, 'get', ['nope', 'x']).ok).toBe(false)
    expect(runCommand(sqlite, 'exec', ['DROP TABLE documents']).ok).toBe(false)
  })
})
