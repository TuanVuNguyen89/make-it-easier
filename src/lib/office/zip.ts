import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate'
import { ToolError } from '@/tools/types'

/** Giải nén tệp Office (zip). Không đọc được thì coi là tệp hỏng hoặc không đúng định dạng. */
export function unzipOffice(bytes: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes)
  } catch {
    throw new ToolError('invalid-office', 'Not a valid Office file')
  }
}

export const readText = (files: Record<string, Uint8Array>, name: string): string | null => {
  const f = files[name]
  return f ? strFromU8(f) : null
}

export function zipOffice(entries: Record<string, string | Uint8Array>): Uint8Array {
  const out: Record<string, Uint8Array> = {}
  for (const [k, v] of Object.entries(entries)) out[k] = typeof v === 'string' ? strToU8(v) : v
  return zipSync(out, { level: 6 })
}

/** Phân giải đường dẫn tương đối trong quan hệ OPC, ví dụ "../media/a.png" từ "ppt/slides". */
export function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = baseDir.split('/').filter(Boolean)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}
