import { ToolError } from '@/tools/types'
import { throwIfAborted } from './pdf'

type PdfjsModule = typeof import('pdfjs-dist')

/** Nơi vẽ trang PDF ra ảnh. Mặc định là trình duyệt (OffscreenCanvas); test Node gắn backend khác. */
export interface RasterBackend {
  loadPdfjs(): Promise<PdfjsModule>
  createCanvas(width: number, height: number): unknown
  encode(canvas: unknown, format: 'png' | 'jpg'): Promise<Uint8Array>
  assetsBase: string
  /**
   * Tùy chọn thêm cho pdfjs.getDocument. Trình duyệt cần: canvas factory không dùng `document`,
   * và một worker lồng thật (nếu không pdf.js chạy "fake worker" và chiếm onmessage của worker chứa nó).
   */
  documentOptions?(pdfjs: PdfjsModule): { options: Record<string, unknown>; dispose(): void }
}

type OffscreenCtx = { canvas: OffscreenCanvas | null; context: unknown }

/** pdf.js mặc định tạo canvas bằng `document`, mà worker không có; dùng OffscreenCanvas thay thế. */
class OffscreenCanvasFactory {
  create(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size')
    const canvas = new OffscreenCanvas(width, height)
    return { canvas, context: canvas.getContext('2d') }
  }
  reset(cc: OffscreenCtx, width: number, height: number) {
    cc.canvas!.width = width
    cc.canvas!.height = height
  }
  destroy(cc: OffscreenCtx) {
    if (cc.canvas) {
      cc.canvas.width = 0
      cc.canvas.height = 0
    }
    cc.canvas = null
    cc.context = null
  }
  getNoAlphaContext(canvas: OffscreenCanvas) {
    return canvas.getContext('2d', { alpha: false })
  }
}

/**
 * Bộ lọc ảnh của pdf.js mặc định dựng bộ lọc SVG trong `document` (dùng cho mặt nạ độ sáng của ảnh, chế độ tương phản cao...); worker
 * không có `document` nên báo "Cannot read properties of undefined (reading 'URL')" với PDF có ảnh dùng SMask (ví dụ trang Wikipedia).
 * Bộ lọc rỗng trả "none": trang vẫn vẽ được, chỉ không áp bộ lọc SVG.
 */
class NoFilterFactory {
  addFilter() {
    return 'none'
  }
  addHCMFilter() {
    return 'none'
  }
  addAlphaFilter() {
    return 'none'
  }
  addLuminosityFilter() {
    return 'none'
  }
  addHighlightHCMFilter() {
    return 'none'
  }
  destroy() {}
}

let pdfjsWorkerUrl = ''

const browserBackend: RasterBackend = {
  async loadPdfjs() {
    const pdfjs = await import('pdfjs-dist')
    pdfjsWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl
    return pdfjs
  },
  createCanvas: (w, h) => new OffscreenCanvas(w, h),
  async encode(canvas, format) {
    const blob = await (canvas as OffscreenCanvas).convertToBlob({
      type: format === 'png' ? 'image/png' : 'image/jpeg',
      quality: 0.92,
    })
    return new Uint8Array(await blob.arrayBuffer())
  },
  assetsBase: `${import.meta.env.BASE_URL}pdfjs/`,
  // disableFontFace: vẽ chữ bằng đường nét, không cần document.fonts (không có trong worker).
  documentOptions(pdfjs) {
    const worker = new pdfjs.PDFWorker({ port: new Worker(pdfjsWorkerUrl, { type: 'module' }) as never })
    return {
      options: {
        worker,
        // disableFontFace: vẽ chữ bằng đường nét, không cần document.fonts (không có trong worker).
        disableFontFace: true,
        CanvasFactory: OffscreenCanvasFactory,
        FilterFactory: NoFilterFactory,
        isOffscreenCanvasSupported: true,
        // useWorkerFetch tường minh: giá trị mặc định được tính bằng document.baseURI nên sẽ lỗi trong worker.
        useWorkerFetch: true,
      },
      dispose: () => worker.destroy(),
    }
  },
}

let backend: RasterBackend = browserBackend
export function setRasterBackend(b: RasterBackend): void {
  backend = b
}

type PdfjsDoc = Awaited<ReturnType<PdfjsModule['getDocument']>['promise']>

/** Mở PDF bằng pdf.js theo cách chạy được cả trong worker; gọi close() khi xong. Lỗi được đổi thành mã công cụ. */
export async function openPdf(bytes: Uint8Array): Promise<{ pdfjs: PdfjsModule; doc: PdfjsDoc; close: () => Promise<void> }> {
  const pdfjs = await backend.loadPdfjs()
  const a = backend.assetsBase
  const extra = backend.documentOptions?.(pdfjs)
  const task = pdfjs.getDocument({
    data: bytes.slice(), // pdf.js chiếm quyền bộ đệm; đưa bản sao để bản gốc không bị tách
    standardFontDataUrl: `${a}standard_fonts/`,
    cMapUrl: `${a}cmaps/`,
    cMapPacked: true,
    wasmUrl: `${a}wasm/`,
    iccUrl: `${a}iccs/`,
    verbosity: 0,
    ...extra?.options,
  })
  let doc: PdfjsDoc
  try {
    doc = await task.promise
  } catch (e) {
    extra?.dispose()
    throw new ToolError((e as { name?: string }).name === 'PasswordException' ? 'encrypted' : 'invalid-pdf')
  }
  return {
    pdfjs,
    doc,
    close: async () => {
      await task.destroy()
      extra?.dispose()
    },
  }
}

/** Giới hạn số điểm ảnh một trang để tránh hết bộ nhớ (≈ A0 ở 150 dpi). */
const MAX_PIXELS = 60_000_000

/** Vẽ từng trang ra ảnh, nền trắng, và gọi onPage ngay khi xong để giải phóng bộ nhớ dần. */
export async function rasterizePdf(
  bytes: Uint8Array,
  { dpi, format, pages }: { dpi: number; format: 'png' | 'jpg'; /** Chỉ vẽ các trang này (chỉ số từ 0); bỏ trống là tất cả. */ pages?: number[] },
  onPage: (index: number, total: number, data: Uint8Array) => void,
  signal: AbortSignal,
): Promise<void> {
  const { doc, close } = await openPdf(bytes)
  try {
    const scale = dpi / 72
    const only = pages ? new Set(pages) : null
    for (let i = 1; i <= doc.numPages; i++) {
      throwIfAborted(signal)
      if (only && !only.has(i - 1)) continue
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale })
      const w = Math.ceil(viewport.width)
      const h = Math.ceil(viewport.height)
      if (w * h > MAX_PIXELS) throw new ToolError('invalid-options', 'Page is too large for this resolution')
      const canvas = backend.createCanvas(w, h)
      await page.render({ canvas: canvas as HTMLCanvasElement, viewport, background: 'rgb(255,255,255)' }).promise
      onPage(i - 1, doc.numPages, await backend.encode(canvas, format))
      page.cleanup()
    }
  } finally {
    await close()
  }
}
