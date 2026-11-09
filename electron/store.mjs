// Kho dữ liệu của app máy tính: siêu dữ liệu trong SQLite (node:sqlite có sẵn trong Electron/Node, không cần biên dịch
// mô-đun gốc nên đóng gói cho Windows/macOS/Linux đều giống nhau), nội dung tệp là tệp thật trong thư mục dữ liệu.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TABLES = {
  documents: { index: { folderId: 'folderId' } },
  folders: { index: { parentId: 'parentId' } },
  runs: { index: {} },
}

const quota = (e) => (e && (e.code === 'ENOSPC' || e.code === 'EDQUOT') ? Object.assign(new Error('Storage quota exceeded'), { name: 'QuotaExceededError' }) : e)

export function openStore(dir) {
  mkdirSync(join(dir, 'blobs'), { recursive: true })
  const db = new DatabaseSync(join(dir, 'library.sqlite'))
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, folderId TEXT, updatedAt INTEGER, json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS documents_folder ON documents(folderId);
    CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, parentId TEXT, json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS folders_parent ON folders(parentId);
    CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, json TEXT NOT NULL);
  `)
  const blobPath = (id) => {
    if (!/^[0-9a-f-]{8,64}$/i.test(id)) throw new Error('Invalid blob id')
    return join(dir, 'blobs', id)
  }
  const parse = (row) => (row ? JSON.parse(row.json) : undefined)
  const table = (name) => {
    if (!TABLES[name]) throw new Error(`Unknown store: ${name}`)
    return name
  }

  function putRow(store, value) {
    if (store === 'documents') db.prepare('INSERT OR REPLACE INTO documents (id, folderId, updatedAt, json) VALUES (?, ?, ?, ?)').run(value.id, value.folderId ?? null, value.updatedAt ?? 0, JSON.stringify(value))
    else if (store === 'folders') db.prepare('INSERT OR REPLACE INTO folders (id, parentId, json) VALUES (?, ?, ?)').run(value.id, value.parentId ?? null, JSON.stringify(value))
    else db.prepare('INSERT OR REPLACE INTO runs (id, json) VALUES (?, ?)').run(value.id, JSON.stringify(value))
  }
  function writeBlob(id, data) {
    const file = blobPath(id)
    const tmp = `${file}.tmp`
    try {
      writeFileSync(tmp, Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data))
      renameSync(tmp, file)
    } catch (e) {
      rmSync(tmp, { force: true })
      throw quota(e)
    }
  }

  const api = {
    get(store, key) {
      if (store === 'blobs') {
        const file = blobPath(key)
        if (!existsSync(file)) return undefined
        const buf = readFileSync(file)
        return { id: key, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
      }
      return parse(db.prepare(`SELECT json FROM ${table(store)} WHERE id = ?`).get(key))
    },
    getAll(store) {
      if (store === 'blobs') throw new Error('Listing blobs is not supported')
      return db.prepare(`SELECT json FROM ${table(store)}`).all().map(parse)
    },
    getAllFromIndex(store, index, value) {
      const col = TABLES[table(store)].index[index]
      if (!col) throw new Error(`Unknown index: ${store}.${index}`)
      return db.prepare(`SELECT json FROM ${store} WHERE ${col} = ?`).all(value).map(parse)
    },
    put(store, value) {
      if (store === 'blobs') return writeBlob(value.id, value.data)
      try {
        putRow(table(store), value)
      } catch (e) {
        throw quota(e)
      }
    },
    delete(store, key) {
      if (store === 'blobs') return rmSync(blobPath(key), { force: true })
      db.prepare(`DELETE FROM ${table(store)} WHERE id = ?`).run(key)
    },
    putDocumentWithBlob(doc, blob) {
      writeBlob(blob.id, blob.data)
      try {
        db.exec('BEGIN')
        putRow('documents', doc)
        db.exec('COMMIT')
      } catch (e) {
        try { db.exec('ROLLBACK') } catch { /* chưa bắt đầu giao dịch */ }
        rmSync(blobPath(blob.id), { force: true })
        throw quota(e)
      }
    },
    deleteDocumentWithBlob(docId, blobId) {
      db.prepare('DELETE FROM documents WHERE id = ?').run(docId)
      rmSync(blobPath(blobId), { force: true })
    },
    close() {
      db.close()
    },
  }
  return api
}

/** Chạy một lệnh từ renderer; lỗi trả về dạng dữ liệu vì Error mất `name` khi đi qua IPC. */
export function runCommand(store, method, args) {
  if (!['get', 'getAll', 'getAllFromIndex', 'put', 'delete', 'putDocumentWithBlob', 'deleteDocumentWithBlob'].includes(method)) {
    return { ok: false, name: 'Error', message: `Unknown method: ${method}` }
  }
  try {
    return { ok: true, value: store[method](...args) ?? null }
  } catch (e) {
    return { ok: false, name: e?.name ?? 'Error', message: String(e?.message ?? e) }
  }
}
