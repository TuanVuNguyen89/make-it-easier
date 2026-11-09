import { idbStore, type LibraryDb, type LibraryStore } from './db'
import {
  StorageQuotaError,
  type DocumentRecord,
  type FolderRecord,
  type LibraryView,
} from './types'

export interface NewDocumentInput {
  name: string
  mime: string
  data: ArrayBuffer | Uint8Array
  pageCount?: number | null
  folderId?: string | null
}

export interface ListOptions {
  view: LibraryView
  folderId?: string | null
  query?: string
  /** 'everywhere': bỏ lọc theo thư mục (dùng cho ô chọn file từ thư viện). */
  scope?: 'folder' | 'everywhere'
  /** 'images' chỉ ảnh, 'files' mọi thứ trừ ảnh; bỏ trống là tất cả (ô chọn tệp của công cụ). */
  kind?: 'images' | 'files'
}

const newId = () => crypto.randomUUID()

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

function isQuotaError(e: unknown): boolean {
  return (e instanceof DOMException || e instanceof Error) && e.name === 'QuotaExceededError'
}

/** "a.pdf" -> "a (2).pdf" nếu "a.pdf" đã có. */
export function withSuffix(name: string, n: number): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return `${name} (${n})`
  return `${name.slice(0, dot)} (${n})${name.slice(dot)}`
}

export function createRepository(source: LibraryDb | LibraryStore) {
  const db: LibraryStore = 'putDocumentWithBlob' in source ? source : idbStore(source)
  async function uniqueDocName(name: string, folderId: string | null, ignoreId?: string) {
    // IndexedDB không lập chỉ mục khóa null (thư mục gốc) nên lọc trong bộ nhớ; chỉ là siêu dữ liệu.
    const siblings = (await db.getAll('documents')).filter(
      (d) => d.folderId === folderId && d.deletedAt === null && d.id !== ignoreId,
    )
    const taken = new Set(siblings.map((d) => d.name.toLowerCase()))
    let candidate = name
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = withSuffix(name, n)
    return candidate
  }

  async function uniqueFolderName(name: string, parentId: string | null, ignoreId?: string) {
    const siblings = (await db.getAll('folders')).filter(
      (f) => f.parentId === parentId && f.deletedAt === null && f.id !== ignoreId,
    )
    const taken = new Set(siblings.map((f) => f.name.toLowerCase()))
    let candidate = name
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name} (${n})`
    return candidate
  }

  async function descendantFolderIds(folderId: string): Promise<string[]> {
    const out: string[] = []
    const stack = [folderId]
    while (stack.length) {
      const id = stack.pop()!
      out.push(id)
      for (const child of await db.getAllFromIndex('folders', 'parentId', id)) stack.push(child.id)
    }
    return out
  }

  return {
    async createDocument(input: NewDocumentInput): Promise<DocumentRecord> {
      const folderId = input.folderId ?? null
      const buffer = toArrayBuffer(input.data)
      const now = Date.now()
      const record: DocumentRecord = {
        id: newId(),
        name: await uniqueDocName(input.name, folderId),
        mime: input.mime,
        size: buffer.byteLength,
        pageCount: input.pageCount ?? null,
        folderId,
        favorite: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        blobId: newId(),
      }
      try {
        await db.putDocumentWithBlob(record, { id: record.blobId, data: buffer })
      } catch (e) {
        if (isQuotaError(e)) throw new StorageQuotaError()
        throw e
      }
      return record
    },

    async getDocument(id: string) {
      return db.get('documents', id)
    },

    async getBytes(id: string): Promise<Uint8Array> {
      const doc = await db.get('documents', id)
      if (!doc) throw new Error(`Document not found: ${id}`)
      const blob = await db.get('blobs', doc.blobId)
      if (!blob) throw new Error(`Blob missing for document: ${id}`)
      return new Uint8Array(blob.data)
    },

    async listDocuments({ view, folderId = null, query = '', scope = 'folder', kind }: ListOptions) {
      const q = query.trim().toLowerCase()
      let docs = await db.getAll('documents')
      if (kind) docs = docs.filter((d) => d.mime.startsWith('image/') === (kind === 'images'))
      if (view === 'trash') docs = docs.filter((d) => d.deletedAt !== null)
      else docs = docs.filter((d) => d.deletedAt === null)
      if (view === 'favorites') docs = docs.filter((d) => d.favorite)
      // Có từ khóa: tìm trên toàn thư viện; không thì giới hạn theo thư mục (chỉ tab Tất cả).
      if (view === 'all' && !q && scope === 'folder') docs = docs.filter((d) => d.folderId === folderId)
      if (q) docs = docs.filter((d) => d.name.toLowerCase().includes(q))
      const key = view === 'trash' ? 'deletedAt' : 'updatedAt'
      docs.sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
      return view === 'recent' ? docs.slice(0, 50) : docs
    },

    async renameDocument(id: string, name: string) {
      const doc = await db.get('documents', id)
      if (!doc) throw new Error(`Document not found: ${id}`)
      doc.name = await uniqueDocName(name.trim(), doc.folderId, id)
      doc.updatedAt = Date.now()
      await db.put('documents', doc)
      return doc
    },

    async moveDocument(id: string, folderId: string | null) {
      const doc = await db.get('documents', id)
      if (!doc) throw new Error(`Document not found: ${id}`)
      doc.name = await uniqueDocName(doc.name, folderId, id)
      doc.folderId = folderId
      doc.updatedAt = Date.now()
      await db.put('documents', doc)
      return doc
    },

    async setFavorite(id: string, favorite: boolean) {
      const doc = await db.get('documents', id)
      if (!doc) throw new Error(`Document not found: ${id}`)
      doc.favorite = favorite
      await db.put('documents', doc)
      return doc
    },

    async softDeleteDocument(id: string) {
      const doc = await db.get('documents', id)
      if (!doc) return
      doc.deletedAt = Date.now()
      await db.put('documents', doc)
    },

    async restoreDocument(id: string) {
      const doc = await db.get('documents', id)
      if (!doc) throw new Error(`Document not found: ${id}`)
      // Thư mục cha đã bị xóa/không còn: đưa về gốc.
      if (doc.folderId) {
        const parent = await db.get('folders', doc.folderId)
        if (!parent || parent.deletedAt !== null) doc.folderId = null
      }
      doc.name = await uniqueDocName(doc.name, doc.folderId, id)
      doc.deletedAt = null
      doc.updatedAt = Date.now()
      await db.put('documents', doc)
      return doc
    },

    async purgeDocument(id: string) {
      const doc = await db.get('documents', id)
      if (!doc) return
      await db.deleteDocumentWithBlob(id, doc.blobId)
    },

    async emptyTrash() {
      const trashed = (await db.getAll('documents')).filter((d) => d.deletedAt !== null)
      for (const d of trashed) await this.purgeDocument(d.id)
      for (const f of await db.getAll('folders')) if (f.deletedAt !== null) await db.delete('folders', f.id)
    },

    /** Mọi thư mục chưa xóa, kèm đường dẫn hiển thị, dùng cho hộp thoại di chuyển. */
    async listFolderTree(): Promise<{ folder: FolderRecord; path: string }[]> {
      const all = (await db.getAll('folders')).filter((f) => f.deletedAt === null)
      const byId = new Map(all.map((f) => [f.id, f]))
      const label = (f: FolderRecord): string => {
        const parent = f.parentId ? byId.get(f.parentId) : undefined
        return parent ? `${label(parent)} / ${f.name}` : f.name
      }
      return all.map((folder) => ({ folder, path: label(folder) })).sort((a, b) => a.path.localeCompare(b.path))
    },

    async createFolder(name: string, parentId: string | null = null): Promise<FolderRecord> {
      const now = Date.now()
      const folder: FolderRecord = {
        id: newId(),
        name: await uniqueFolderName(name.trim(), parentId),
        parentId,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      }
      await db.put('folders', folder)
      return folder
    },

    async getFolder(id: string) {
      return db.get('folders', id)
    },

    async listFolders(parentId: string | null = null, query = '') {
      const q = query.trim().toLowerCase()
      let folders = (await db.getAll('folders')).filter((f) => f.deletedAt === null)
      folders = q
        ? folders.filter((f) => f.name.toLowerCase().includes(q))
        : folders.filter((f) => f.parentId === parentId)
      return folders.sort((a, b) => a.name.localeCompare(b.name))
    },

    /** Chuỗi thư mục từ gốc đến thư mục hiện tại, dùng cho breadcrumb. */
    async folderPath(folderId: string | null): Promise<FolderRecord[]> {
      const path: FolderRecord[] = []
      let cur = folderId
      while (cur) {
        const f = await db.get('folders', cur)
        if (!f) break
        path.unshift(f)
        cur = f.parentId
      }
      return path
    },

    async renameFolder(id: string, name: string) {
      const f = await db.get('folders', id)
      if (!f) throw new Error(`Folder not found: ${id}`)
      f.name = await uniqueFolderName(name.trim(), f.parentId, id)
      f.updatedAt = Date.now()
      await db.put('folders', f)
      return f
    },

    async moveFolder(id: string, parentId: string | null) {
      const f = await db.get('folders', id)
      if (!f) throw new Error(`Folder not found: ${id}`)
      if (parentId && (await descendantFolderIds(id)).includes(parentId)) {
        throw new Error('Cannot move a folder into itself or its descendants')
      }
      f.name = await uniqueFolderName(f.name, parentId, id)
      f.parentId = parentId
      f.updatedAt = Date.now()
      await db.put('folders', f)
      return f
    },

    /** Xóa mềm thư mục cùng toàn bộ thư mục con và tài liệu bên trong (cùng một dấu thời gian). */
    async softDeleteFolder(id: string) {
      const ids = await descendantFolderIds(id)
      const now = Date.now()
      for (const fid of ids) {
        const f = await db.get('folders', fid)
        if (f && f.deletedAt === null) await db.put('folders', { ...f, deletedAt: now })
        for (const d of await db.getAllFromIndex('documents', 'folderId', fid)) {
          if (d.deletedAt === null) await db.put('documents', { ...d, deletedAt: now })
        }
      }
    },
  }
}

export type Repository = ReturnType<typeof createRepository>
