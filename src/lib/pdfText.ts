import { openPdf } from './pdfRaster'
import { throwIfAborted } from './pdf'

export interface TextRun {
  str: string
  /** Mép trái và đường cơ sở theo tọa độ nhìn thấy (gốc trên-trái, y hướng xuống), đơn vị điểm. */
  x: number
  y: number
  w: number
  size: number
  /** Hướng chữ trên màn hình, độ ngược chiều kim đồng hồ (0 = nằm ngang, đọc từ trái sang phải). */
  angle: number
}
export interface PageText {
  width: number
  height: number
  runs: TextRun[]
}

/** Trích chữ kèm vị trí và cỡ chữ cho từng trang, theo hướng nhìn thấy (đã tính xoay trang). */
export async function extractPdfText(bytes: Uint8Array, signal: AbortSignal, onPage?: (done: number, total: number) => void): Promise<PageText[]> {
  const { pdfjs, doc, close } = await openPdf(bytes)
  try {
    const pages: PageText[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      throwIfAborted(signal)
      const page = await doc.getPage(i)
      const vp = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const runs: TextRun[] = []
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue
        const t = pdfjs.Util.transform(vp.transform, it.transform) as number[]
        // t[0], t[1] là hướng đường cơ sở trên màn hình (y hướng xuống) nên góc ngược chiều kim đồng hồ là -atan2.
        const angle = Math.round((-Math.atan2(t[1]!, t[0]!) * 180) / Math.PI * 10) / 10
        runs.push({ str: it.str, x: t[4]!, y: t[5]!, w: it.width, size: Math.hypot(t[2]!, t[3]!) || it.height, angle: angle === 0 ? 0 : angle })
      }
      pages.push({ width: vp.width, height: vp.height, runs })
      page.cleanup()
      onPage?.(i, doc.numPages)
    }
    return pages
  } finally {
    await close()
  }
}

export interface Line {
  x: number
  y: number
  size: number
  text: string
  runs: TextRun[]
}

/** Gom các đoạn chữ thành dòng (cùng đường cơ sở), sắp từ trên xuống, trong dòng từ trái sang phải. */
export function toLines(runs: TextRun[], tolerance = 0.4): Line[] {
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: TextRun[][] = []
  for (const r of sorted) {
    const last = lines.at(-1)
    const ref = last?.[0]
    if (last && ref && Math.abs(r.y - ref.y) <= Math.max(2, Math.min(r.size, ref.size) * tolerance)) last.push(r)
    else lines.push([r])
  }
  return lines.map((rs) => {
    rs.sort((a, b) => a.x - b.x)
    let text = ''
    rs.forEach((r, i) => {
      const prev = rs[i - 1]
      // Thêm khoảng trắng khi hai đoạn cách nhau đủ xa (pdf.js tách từ thành các đoạn riêng).
      if (prev && r.x - (prev.x + prev.w) > r.size * 0.2 && !text.endsWith(' ') && !r.str.startsWith(' ')) text += ' '
      text += r.str
    })
    return { x: rs[0]!.x, y: rs[0]!.y, size: Math.max(...rs.map((r) => r.size)), text: text.trim(), runs: rs }
  })
}
