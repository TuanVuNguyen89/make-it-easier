/**
 * Chuyển tệp đã chọn từ trang "Chuyển đổi PDF" sang trang công cụ đích mà không bắt chọn lại.
 * Chỉ nằm trong bộ nhớ (không lưu đâu cả). peek() không xóa để an toàn với StrictMode; trang đích gọi clear() khi đã nhận.
 */
export interface HandoffFile {
  name: string
  bytes: Uint8Array
}

let pending: HandoffFile[] = []

export const setHandoff = (files: HandoffFile[]) => {
  pending = files
}
export const peekHandoff = (): HandoffFile[] => pending
export const clearHandoff = () => {
  pending = []
}
