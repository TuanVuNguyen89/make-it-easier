import { ToolError } from '@/tools/types'

/**
 * Phân tích "1-3, 5, 8-" thành các nhóm chỉ số trang (từ 0), giữ nguyên thứ tự người dùng nhập.
 * Cú pháp: N, N-M (N ≤ M), N- (đến trang cuối). Sai cú pháp hoặc ngoài phạm vi: ToolError('invalid-options').
 */
export function parseRangeGroups(text: string, pageCount: number): number[][] {
  const parts = text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) throw new ToolError('invalid-options', 'Empty page range')
  return parts.map((part) => {
    const m = /^(\d+)(?:\s*(-)\s*(\d*))?$/.exec(part)
    if (!m) throw new ToolError('invalid-options', `Bad range: ${part}`)
    const from = Number(m[1])
    const to = m[2] ? (m[3] ? Number(m[3]) : pageCount) : from
    if (from < 1 || to < from || to > pageCount) {
      throw new ToolError('invalid-options', `Range out of bounds: ${part}`)
    }
    return Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i)
  })
}

/** Gộp mọi nhóm thành một danh sách phẳng (giữ thứ tự, giữ trùng lặp). */
export function parseRanges(text: string, pageCount: number): number[] {
  return parseRangeGroups(text, pageCount).flat()
}
