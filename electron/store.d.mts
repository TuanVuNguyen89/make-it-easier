export interface SqliteStore {
  get(store: string, key: string): unknown
  getAll(store: string): unknown[]
  getAllFromIndex(store: string, index: string, value: string): unknown[]
  put(store: string, value: unknown): void
  delete(store: string, key: string): void
  putDocumentWithBlob(doc: unknown, blob: { id: string; data: ArrayBuffer | Uint8Array }): void
  deleteDocumentWithBlob(docId: string, blobId: string): void
  close(): void
}
export function openStore(dir: string): SqliteStore
export function runCommand(store: SqliteStore, method: string, args: unknown[]): { ok: true; value: unknown } | { ok: false; name: string; message: string }
