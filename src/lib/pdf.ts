import { PDFDocument } from 'pdf-lib'
import { ToolError } from '@/tools/types'

/** Mở PDF và đổi lỗi của pdf-lib thành mã lỗi rõ ràng của công cụ. */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes)
  } catch (e) {
    const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e)
    if (/encrypt/i.test(msg)) throw new ToolError('encrypted', 'PDF is password protected')
    throw new ToolError('invalid-pdf', 'Not a valid PDF')
  }
}

export { throwIfAborted } from './abort'
