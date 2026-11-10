import { ToolError } from '@/tools/types'

export interface OcrWord {
  text: string
  /** Khung bao theo pixel của ảnh đã đưa vào nhận dạng. */
  x0: number
  y0: number
  x1: number
  y1: number
  confidence: number
  /** Đường cơ sở (pixel) của cả dòng chứa từ: các từ cùng dòng có chung đường cơ sở dù khung bao có/không có phần thò xuống (g, p, y). */
  baseline?: number
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

/**
 * Lọc nhiễu OCR trong một dòng của Tesseract theo độ tin cậy và các từ láng giềng. Từ ≥ 60 giữ nguyên. Từ kém tin cậy chỉ giữ khi dài
 * (≥ 5 chữ cái, như từ ghép tiếng Đức), không toàn chữ hoa, và có từ tin cậy trong vòng 2 vị trí; chữ ghi chú nhỏ dính sau từ
 * (ví dụ "[59]" bị đọc thành "S9l") được cắt bỏ. Nhiễu từ hình vẽ/chữ viết tay (ngắn, toàn chữ hoa, hoặc lẻ loi) bị loại.
 */
export function keepLineWords<T extends { text: string; confidence: number }>(words: T[]): { w: T; text: string }[] {
  const kept: { w: T; text: string }[] = []
  words.forEach((w, i) => {
    const text = w.text.trim()
    if (!text) return
    if (w.confidence >= 60) return void kept.push({ w, text })
    const near = [-2, -1, 1, 2].some((d) => (words[i + d]?.confidence ?? 0) >= 60)
    const m = /^(\p{L}{5,}[.,;:!?)"“”„]*)[^\s]{0,6}$/u.exec(text)
    if (near && m && !/^\p{Lu}+$/u.test(m[1]!.replace(/[^\p{L}]/gu, ''))) kept.push({ w, text: m[1]! })
  })
  return kept
}

interface RawWord { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
/** Phân vị p (0–1) của dãy số. */
const quantile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : 0
}
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
          for (const l of p.lines) {
            // Từ độ tin cậy thấp thường là nhiễu từ hình vẽ/chữ viết tay trong ảnh: chỉ giữ từ dài khi cả dòng đáng tin.
            // Từ dài chỉ gồm chữ cái (từ ghép tiếng Đức như "hochverschuldeten") hay có độ tin cậy thấp dù đúng khi cả dòng đáng tin;
            // nhiễu thường ngắn, toàn chữ hoa hoặc lẫn ký hiệu.
            // Dòng của Tesseract có thể lẫn cả vùng hình ảnh nên xét từ láng giềng (từ liền trước/sau) thay vì cả dòng.
            const kept = keepLineWords(l.words)
            if (!kept.length) continue
            // Đường cơ sở dòng: phần lớn từ không có phần thò xuống nên lấy phân vị thấp của mép dưới khung.
            const baseline = quantile(kept.map(({ w }) => w.bbox.y1), 0.4)
            for (const { w, text } of kept) words.push({ text, confidence: w.confidence, ...w.bbox, baseline })
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
