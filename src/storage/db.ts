import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { BlobRecord, DocumentRecord, FolderRecord, ToolRunRecord } from './types'

interface LibrarySchema extends DBSchema {
  documents: {
    key: string
    value: DocumentRecord
    indexes: { folderId: string; updatedAt: number }
  }
  folders: {
    key: string
    value: FolderRecord
    indexes: { parentId: string }
  }
  blobs: { key: string; value: BlobRecord }
  runs: { key: string; value: ToolRunRecord; indexes: { updatedAt: number } }
}

export type LibraryDb = IDBPDatabase<LibrarySchema>

export const DB_NAME = 'make-it-easier'
export const DB_VERSION = 1

export function openLibraryDb(name: string = DB_NAME): Promise<LibraryDb> {
  return openDB<LibrarySchema>(name, DB_VERSION, {
    upgrade(db) {
      const docs = db.createObjectStore('documents', { keyPath: 'id' })
      docs.createIndex('folderId', 'folderId')
      docs.createIndex('updatedAt', 'updatedAt')
      const folders = db.createObjectStore('folders', { keyPath: 'id' })
      folders.createIndex('parentId', 'parentId')
      db.createObjectStore('blobs', { keyPath: 'id' })
      const runs = db.createObjectStore('runs', { keyPath: 'id' })
      runs.createIndex('updatedAt', 'updatedAt')
    },
  })
}

/** Giá trị theo từng kho (bảng). */
export interface StoreValues {
  documents: DocumentRecord
  folders: FolderRecord
  blobs: BlobRecord
  runs: ToolRunRecord
}
export type StoreName = keyof StoreValues

/**
 * Phần tối thiểu của kho dữ liệu mà repository dùng. IndexedDB (web) và SQLite (app máy tính, qua IPC) cùng hiện thực
 * giao diện này nên logic thư viện chỉ viết một lần.
 */
export interface LibraryStore {
  get<S extends StoreName>(store: S, key: string): Promise<StoreValues[S] | undefined>
  getAll<S extends StoreName>(store: S): Promise<StoreValues[S][]>
  getAllFromIndex<S extends 'documents' | 'folders'>(store: S, index: S extends 'documents' ? 'folderId' : 'parentId', value: string): Promise<StoreValues[S][]>
  put<S extends StoreName>(store: S, value: StoreValues[S]): Promise<unknown>
  delete(store: StoreName, key: string): Promise<void>
  /** Ghi nguyên tử một tài liệu cùng nội dung (hoặc xóa cả hai). */
  putDocumentWithBlob(doc: DocumentRecord, blob: BlobRecord): Promise<void>
  deleteDocumentWithBlob(docId: string, blobId: string): Promise<void>
}

export function idbStore(db: LibraryDb): LibraryStore {
  return {
    get: (s, k) => db.get(s, k) as never,
    getAll: (s) => db.getAll(s) as never,
    getAllFromIndex: (s, i, v) => db.getAllFromIndex(s, i as never, v as never) as never,
    put: (s, v) => db.put(s, v as never),
    delete: (s, k) => db.delete(s, k),
    async putDocumentWithBlob(doc, blob) {
      const tx = db.transaction(['documents', 'blobs'], 'readwrite')
      await Promise.all([tx.objectStore('blobs').put(blob), tx.objectStore('documents').put(doc), tx.done])
    },
    async deleteDocumentWithBlob(docId, blobId) {
      const tx = db.transaction(['documents', 'blobs'], 'readwrite')
      await Promise.all([tx.objectStore('blobs').delete(blobId), tx.objectStore('documents').delete(docId), tx.done])
    },
  }
}
