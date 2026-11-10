/** Mô hình trung gian giữ định dạng cho PDF → DOCX: đơn vị là điểm (pt), tọa độ ảnh là tọa độ trang. */
export interface RichRun {
  text: string
  font: string
  /** Họ phông gần nhất, để Word chọn phông thay thế hợp lý khi máy không có phông này. */
  family: 'sans' | 'serif' | 'mono'
  size: number
  bold: boolean
  italic: boolean
  underline: boolean
  /** Màu chữ dạng "RRGGBB". */
  color: string
}
export type TabStop = { pos: number; kind: 'left' | 'right' }
export interface RichParagraph {
  type: 'p'
  runs: RichRun[]
  align: 'left' | 'center' | 'right' | 'both'
  /** Lề trái và lề phải của đoạn (so với vùng nội dung), thụt dòng đầu (âm = treo). */
  indentLeft: number
  indentRight: number
  firstLine: number
  /** Khoảng cách phía trên (pt) và chiều cao dòng cố định (pt). */
  before: number
  lineHeight: number
  tabs: TabStop[]
  list?: { kind: 'bullet' | 'decimal'; suffix: string; /** Số của mục (để đánh số tiếp đúng số trong PDF). */ start?: number }
  outline?: 1 | 2 | 3
  /** Đường kẻ dưới đoạn (đoạn đệm cho đường kẻ ngang). */
  borderBottom?: { width: number; color: string }
  shade?: string
  /** Đoạn một dòng căn trái: cho phép tràn sang lề phải (indentRight âm) để không bị Word ngắt dòng khi phông thay thế rộng hơn. */
  noWrap?: boolean
  /** Mép phải (tọa độ trang) mà chữ của đoạn phải ngắt dòng trước: vùng hẹp cạnh hình/khung. Dùng để suy ra thụt lề phải. */
  wrapTo?: number
  /** Đoạn nằm trong khung chữ đặt tuyệt đối theo trang (chú thích cạnh hình, cột phụ); các đoạn cùng khung có cùng giá trị. */
  frame?: { x: number; y: number; w: number }
}
export interface RichCell {
  /** Số cột/hàng trải ra; hàng bị gộp từ trên có `vMerge: 'continue'`. */
  colSpan: number
  rowSpan: number
  vMerge?: 'restart' | 'continue'
  width: number
  shade?: string
  content: RichParagraph[]
}
export interface RichTable {
  type: 'table'
  colWidths: number[]
  rows: { height: number; cells: RichCell[] }[]
  border: { width: number; color: string } | null
  /** Thụt lề trái của bảng so với vùng nội dung. */
  indent: number
}
export type RichElement = RichParagraph | RichTable
export interface RichImage {
  key: string
  data: Uint8Array
  ext: 'png' | 'jpeg'
  x: number
  y: number
  w: number
  h: number
  /** true: nằm sau chữ (có chữ đè lên ảnh); false: nằm trước (che bảng/nền). */
  behind: boolean
}
export interface RichColumn {
  x: number
  width: number
  elements: RichElement[]
}
export interface RichPage {
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
  columns: RichColumn[]
  images: RichImage[]
  /** Số ảnh quét bị bỏ vì trang đã có lớp chữ OCR (chữ thật thay cho ảnh). */
  scanImagesRemoved: number
  /** Chỉ dùng nội bộ: ảnh quét đã bỏ và các khung chữ OCR (tọa độ trang) để tìm lại hình minh họa trong ảnh quét. */
  scan?: { images: { key: string; data: Uint8Array; ext: 'png' | 'jpeg'; x: number; y: number; w: number; h: number }[]; textBoxes: { x0: number; y0: number; x1: number; y1: number }[] }
}
