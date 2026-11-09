/**
 * Ngắt đoạn văn thành dòng vừa bề rộng. `measure` đo bề rộng chuỗi (pdf-lib khi xuất, canvas khi xem trước) nên cùng một
 * thuật toán cho cả hai. Ký tự xuống dòng trong `text` luôn bắt đầu dòng mới. `maxWidth` ≤ 0 hoặc vô hạn: không ngắt.
 */
export function wrapParagraphs(text: string, measure: (s: string) => number, maxWidth: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    if (!(maxWidth > 0) || !Number.isFinite(maxWidth)) {
      out.push(para)
      continue
    }
    let line = ''
    for (const word of para.split(/(?<= )/)) {
      const candidate = line + word
      if (line && measure(candidate.trimEnd()) > maxWidth) {
        out.push(line.trimEnd())
        line = word
      } else line = candidate
      // Từ dài hơn cả bề rộng: ngắt theo ký tự.
      while (measure(line.trimEnd()) > maxWidth && line.length > 1) {
        let cut = line.length - 1
        while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--
        out.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    out.push(line.trimEnd())
  }
  return out
}

export type TextAlign = 'left' | 'center' | 'right'

/** Độ lệch mép trái của một dòng so với mép trái khối (rộng `blockWidth`) theo kiểu căn lề. Âm khi dòng dài hơn khối. */
export function alignOffset(align: TextAlign | undefined, blockWidth: number, lineWidth: number): number {
  if (align === 'center') return (blockWidth - lineWidth) / 2
  if (align === 'right') return blockWidth - lineWidth
  return 0
}
