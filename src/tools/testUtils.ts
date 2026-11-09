import { PDFDocument } from 'pdf-lib'
import type { RunContext } from './types'

/** PDF thử nghiệm: trang thứ i (từ 1) có chiều rộng 100 + i, để kiểm tra thứ tự sau khi xử lý. */
export async function numberedPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 1; i <= pages; i++) doc.addPage([100 + i, 200])
  return doc.save()
}

export async function widths(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) => p.getWidth() - 100)
}

export async function rotations(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) => p.getRotation().angle)
}

export const ctx = (names?: string[]): RunContext => ({ progress: () => {}, signal: new AbortController().signal, names })

export interface TextItem {
  str: string
  x: number
  y: number
  /** Cỡ chữ (điểm). */
  size: number
  /** Bề rộng đoạn chữ (điểm) theo số đo phông trong tệp. */
  width: number
}

/** Đọc chữ và vị trí (hệ tọa độ trang chưa xoay) của từng trang bằng pdf.js, để kiểm tra đầu ra thật. */
export async function pageTexts(bytes: Uint8Array): Promise<TextItem[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, verbosity: 0 })
  const doc = await task.promise
  const pages: TextItem[][] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    pages.push(
      content.items
        .filter((it): it is Extract<typeof it, { str: string }> => 'str' in it && it.str.trim() !== '')
        .map((it) => ({ str: it.str, x: it.transform[4]!, y: it.transform[5]!, size: it.height, width: it.width })),
    )
  }
  await task.destroy()
  return pages
}
