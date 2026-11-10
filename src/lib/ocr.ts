import { ToolError } from '@/tools/types'

export interface OcrWord {
  text: string
  /** Khung bao theo pixel của ảnh đã đưa vào nhận dạng. */
  x0: number
  y0: number
  x1: number
  y1: number
  confidence: number
}

export interface OcrBackend {
  /** Tùy chọn cho tesseract.js createWorker: đường dẫn worker, lõi wasm và dữ liệu ngôn ngữ. */
  options(): Record<string, unknown>
}

const browserBackend: OcrBackend = {
  options: () => {
    const base = `${import.meta.env.BASE_URL}tesseract`
    // Đường dẫn tuyệt đối vì worker lồng nhau không có gốc tương đối của trang.
    const abs = (p: string) => new URL(p, self.location.origin).href
    return {
      workerPath: abs(`${base}/worker.min.js`),
      corePath: abs(`${base}/core`),
      langPath: abs(`${base}/lang`),
      gzip: true,
      cacheMethod: 'none', // service worker đã cache; tránh ghi trùng vào IndexedDB
    }
  },
}

let backend: OcrBackend = browserBackend
export function setOcrBackend(b: OcrBackend): void {
  backend = b
}

export type OcrLanguage = 'vie+eng' | 'vie' | 'eng' | 'deu+eng' | 'deu'
export const OCR_LANGUAGES: OcrLanguage[] = ['vie+eng', 'vie', 'eng', 'deu+eng', 'deu']

interface RawWord { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
interface RawBlocks { blocks?: { paragraphs: { lines: { words: RawWord[] }[] }[] }[] | null }

/** tesseract.js trên Node cần Buffer; trên trình duyệt (không có Buffer) nhận thẳng Uint8Array. */
const asInput = (b: Uint8Array) => (typeof Buffer !== 'undefined' ? Buffer.from(b) : b)

/** Nhận dạng chữ cho từng ảnh PNG/JPG; trả về danh sách từ có khung bao theo từng ảnh. Luôn dọn worker. */
export async function recognizeImages(
  images: Uint8Array[],
  language: OcrLanguage,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<OcrWord[][]> {
  const { createWorker } = await import('tesseract.js')
  let current = 0
  const worker = await createWorker(language, 1, {
    ...backend.options(),
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress((current + m.progress) / images.length)
    },
  } as never)
  const onAbort = () => void worker.terminate()
  signal.addEventListener('abort', onAbort)
  try {
    const out: OcrWord[][] = []
    for (current = 0; current < images.length; current++) {
      if (signal.aborted) throw new ToolError('aborted', 'Cancelled')
      const { data } = await worker.recognize(asInput(images[current]!) as never, {}, { blocks: true } as never)
      const words: OcrWord[] = []
      for (const b of (data as unknown as RawBlocks).blocks ?? [])
        for (const p of b.paragraphs)
          for (const l of p.lines)
            for (const w of l.words) {
              const text = w.text.trim()
              if (text && w.confidence >= 30) words.push({ text, confidence: w.confidence, ...w.bbox })
            }
      out.push(words)
    }
    return out
  } catch (e) {
    if (signal.aborted) throw new ToolError('aborted', 'Cancelled')
    throw e
  } finally {
    signal.removeEventListener('abort', onAbort)
    await worker.terminate().catch(() => undefined)
  }
}
