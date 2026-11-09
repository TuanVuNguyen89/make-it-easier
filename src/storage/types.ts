export interface DocumentRecord {
  id: string
  name: string
  mime: string
  size: number
  pageCount: number | null
  folderId: string | null
  favorite: boolean
  /** Thời điểm chuyển vào thùng rác; null nếu chưa xóa. */
  deletedAt: number | null
  createdAt: number
  updatedAt: number
  blobId: string
}

export interface FolderRecord {
  id: string
  name: string
  parentId: string | null
  deletedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface BlobRecord {
  id: string
  data: ArrayBuffer
}

export type ToolRunStatus = 'running' | 'done' | 'failed' | 'cancelled'

export interface ToolRunRecord {
  id: string
  toolId: string
  inputIds: string[]
  options: Record<string, unknown>
  status: ToolRunStatus
  progress: number
  outputIds: string[]
  error: string | null
  createdAt: number
  updatedAt: number
}

export type LibraryView = 'all' | 'recent' | 'favorites' | 'trash'

export class StorageQuotaError extends Error {
  constructor() {
    super('Storage quota exceeded')
    this.name = 'StorageQuotaError'
  }
}
