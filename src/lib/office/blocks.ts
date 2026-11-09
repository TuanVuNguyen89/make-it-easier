export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
}

/** Mô hình nội dung trung gian giữa tệp Office và PDF: văn bản, tiêu đề, danh sách, bảng. */
export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; runs: Run[] }
  | { type: 'paragraph'; runs: Run[] }
  | { type: 'list'; marker: string; level: number; runs: Run[] }
  | { type: 'table'; rows: string[][] }
  | { type: 'pageBreak' }

export const plain = (runs: Run[]) => runs.map((r) => r.text).join('')
