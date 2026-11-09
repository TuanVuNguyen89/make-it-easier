import { ToolError } from '@/tools/types'

/** Công cụ gọi giữa các bước nặng để dừng ngay khi người dùng hủy. Tách riêng để import không kéo theo thư viện PDF. */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new ToolError('aborted', 'Cancelled')
}
