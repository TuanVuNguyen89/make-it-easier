/** Đọc số trang; trả null nếu không đọc được (không phải PDF, có mật khẩu...).
 *  pdf-lib nạp lười để không nằm trong bundle chính (constitution IV). */
export async function readPageCount(bytes: Uint8Array): Promise<number | null> {
  try {
    const { PDFDocument } = await import('pdf-lib')
    return (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount()
  } catch {
    return null
  }
}
