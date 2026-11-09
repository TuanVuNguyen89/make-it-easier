import type { LucideIcon } from 'lucide-react'

export type ToolGroup = 'organize' | 'markup' | 'secure' | 'convert' | 'optimize' | 'modify' | 'imgconvert'
export type ToolKind = 'pdf' | 'image'

export interface ToolOutput {
  name: string
  mime: string
  data: Uint8Array
  /** Mã cảnh báo cho người dùng (i18n: warnings.<mã>); công cụ vẫn thành công nhưng có điều cần biết. */
  warnings?: string[]
}

export interface RunContext {
  /** Báo tiến trình từ 0 đến 1. */
  progress(fraction: number): void
  /** Công cụ phải kiểm tra tín hiệu này giữa các bước nặng. */
  signal: AbortSignal
  /** Tên tệp đầu vào (cùng thứ tự với inputs), để đặt tên đầu ra; có thể không có. */
  names?: string[]
}

/** Hợp đồng công cụ: byte vào, tùy chọn, byte ra; không chạm DOM hay lưu trữ. */
export type RunFn<O = Record<string, unknown>> = (
  inputs: Uint8Array[],
  options: O,
  ctx: RunContext,
) => Promise<ToolOutput[]>

export type ToolErrorCode = 'invalid-pdf' | 'encrypted' | 'wrong-password' | 'invalid-image' | 'invalid-office' | 'invalid-options' | 'no-reduction' | 'no-text' | 'no-text-layer' | 'aborted'

export class ToolError extends Error {
  readonly code: ToolErrorCode
  constructor(code: ToolErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'ToolError'
    this.code = code
  }
}

export type ParamDef = {
  key: string
  labelKey: string
  hintKey?: string
  /** Bắt buộc nhập; kiểm tra khi gửi, lỗi hiện dưới trường. */
  required?: boolean
  /** Giá trị phải bằng giá trị của trường có khóa này (nhập lại mật khẩu). */
  mustMatch?: string
} & (
  | { type: 'text'; default?: string; placeholderKey?: string }
  | { type: 'password' }
  | { type: 'number'; default: number; min?: number; max?: number }
  | { type: 'select'; default: string; options: { value: string; labelKey: string }[] }
  | { type: 'boolean'; default: boolean }
  | { type: 'pageRanges'; default?: string }
)

export interface InputSpec {
  /** Phần mở rộng cho ô chọn file, ví dụ ['.pdf']. */
  extensions: string[]
  /** MIME được nhận từ thư viện. */
  mimes: string[]
  min: number
  max: number
  /** Thứ tự đầu vào có ý nghĩa (gộp). */
  ordered: boolean
}

/** Khai báo công cụ cho UI. Tên/mô tả/nhãn nút lấy từ i18n: tools.<id>.name | desc | action. */
export interface ToolMeta {
  id: string
  /** Mặc định 'pdf'. Công cụ ảnh nằm ở danh mục riêng. */
  kind?: ToolKind
  group: ToolGroup
  icon: LucideIcon
  inputs: InputSpec
  params: ParamDef[]
  /** Công cụ có trình chỉnh riêng thay cho form tham số (ví dụ lưới trang). */
  editor?: 'pages' | 'image-crop' | 'image-mask' | 'pdf-annotate' | 'pdf-edit' | 'pdf-sign' | 'pdf-redact'
  /** Hiển thị dung lượng trước/sau ở kết quả. */
  showSizeDelta?: boolean
}
