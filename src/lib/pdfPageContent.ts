import { PDFArray, PDFRawStream, decodePDFRawStream, type PDFDocument } from 'pdf-lib'

/**
 * Nội dung trang đã giải nén và nối lại (các luồng cách nhau bằng xuống dòng nên token không bị cắt đôi).
 * Trả về null nếu có luồng ở dạng lạ (không phải luồng thô) — khi đó không dám đọc/sửa.
 */
export function readPageContent(doc: PDFDocument, pageIndex: number): Uint8Array | null {
  const contents = doc.getPage(pageIndex).node.Contents()
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  const decoded: Uint8Array[] = []
  for (const r of refs) {
    const st = doc.context.lookup(r)
    if (!(st instanceof PDFRawStream)) return null
    decoded.push(decodePDFRawStream(st).decode())
  }
  const all = new Uint8Array(decoded.reduce((n, d) => n + d.length + 1, 0))
  let k = 0
  for (const d of decoded) {
    all.set(d, k)
    k += d.length
    all[k++] = 10
  }
  return all
}
