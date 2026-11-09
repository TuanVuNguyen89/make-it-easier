import { readPageCount } from '@/lib/pageCount'
import { detectMime, isPdf } from '@/lib/mime'
import type { Repository } from '@/storage/repository'
import { StorageQuotaError } from '@/storage/types'

export type UploadReason = 'invalid-pdf' | 'quota' | 'unknown'
export interface UploadResult {
  added: number
  /** Số ảnh trong số đã thêm (ảnh nằm ở thư viện Hình ảnh). */
  images: number
  failed: { name: string; reason: UploadReason }[]
}

async function bytesOf(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer))
    r.onerror = () => reject(r.error)
    r.readAsArrayBuffer(file)
  })
}

/** Còn đủ chỗ trong kho lưu trữ của trình duyệt cho `bytes` không? Không đo được thì coi là đủ. */
async function hasRoom(bytes: number): Promise<boolean> {
  try {
    const { quota, usage } = (await navigator.storage?.estimate?.()) ?? {}
    return quota == null || usage == null || quota - usage > bytes
  } catch {
    return true
  }
}

/** Thêm từng tệp vào thư viện; tệp lỗi được báo riêng và không ảnh hưởng tệp khác. */
export async function uploadFiles(
  repo: Repository,
  files: File[],
  folderId: string | null,
  onProgress?: (done: number, total: number) => void,
): Promise<UploadResult> {
  const result: UploadResult = { added: 0, images: 0, failed: [] }
  // Báo sớm khi chắc chắn không đủ chỗ, thay vì thất bại giữa chừng và để thư viện nửa vời.
  if (!(await hasRoom(files.reduce((n, f) => n + f.size, 0)))) {
    return { added: 0, images: 0, failed: files.map((f) => ({ name: f.name, reason: 'quota' as const })) }
  }
  let done = 0
  for (const file of files) {
    try {
      const data = await bytesOf(file)
      const mime = detectMime(file.name, file.type)
      let pageCount: number | null = null
      if (isPdf(mime)) {
        pageCount = await readPageCount(data)
        if (pageCount === null) {
          result.failed.push({ name: file.name, reason: 'invalid-pdf' })
          continue
        }
      }
      await repo.createDocument({ name: file.name, mime, data, pageCount, folderId })
      result.added++
      if (mime.startsWith('image/')) result.images++
    } catch (e) {
      result.failed.push({ name: file.name, reason: e instanceof StorageQuotaError ? 'quota' : 'unknown' })
    } finally {
      onProgress?.(++done, files.length)
    }
  }
  return result
}
