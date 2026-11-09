import { ToolError } from '@/tools/types'

export interface PdfRenderer {
  pageCount: number
  /** Kích thước trang như người dùng thấy (đã tính xoay), đơn vị điểm PDF. */
  pageSize(index: number): Promise<{ width: number; height: number }>
  /** Vẽ trang (từ 0) với chiều rộng cho trước; trả về object URL của ảnh PNG, có bộ nhớ đệm. */
  render(index: number, width: number): Promise<string>
  destroy(): void
}

const ASSETS = `${import.meta.env.BASE_URL}pdfjs/`

/** Nạp pdf.js lười (constitution IV). Chạy trên luồng chính; pdf.js tự dùng worker riêng để phân tích. */
export async function createPdfRenderer(bytes: Uint8Array): Promise<PdfRenderer> {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({
    data: bytes.slice(), // pdf.js chiếm quyền bộ đệm; đưa bản sao để bản gốc không bị tách
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
  })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    const name = (e as { name?: string }).name
    throw new ToolError(name === 'PasswordException' ? 'encrypted' : 'invalid-pdf')
  }

  const cache = new Map<string, Promise<string>>()
  return {
    pageCount: doc.numPages,
    async pageSize(index) {
      const v = (await doc.getPage(index + 1)).getViewport({ scale: 1 })
      return { width: v.width, height: v.height }
    },
    render(index, width) {
      const key = `${index}:${width}`
      let hit = cache.get(key)
      if (!hit) {
        hit = (async () => {
          const page = await doc.getPage(index + 1)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: width / base.width })
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          await page.render({ canvas, viewport }).promise
          const blob = await new Promise<Blob>((res, rej) =>
            canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'),
          )
          page.cleanup()
          return URL.createObjectURL(blob)
        })()
        cache.set(key, hit)
      }
      return hit
    },
    destroy() {
      for (const p of cache.values()) void p.then((u) => URL.revokeObjectURL(u))
      cache.clear()
      void task.destroy()
    },
  }
}
