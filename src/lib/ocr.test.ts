import { describe, expect, it } from 'vitest'
import { keepLineWords } from './ocr'

const line = (...ws: [string, number][]) => ws.map(([text, confidence]) => ({ text, confidence }))
const texts = (ws: { text: string; confidence: number }[]) => keepLineWords(ws).map((k) => k.text)

describe('keepLineWords: lọc nhiễu OCR', () => {
  it('từ tin cậy cao luôn được giữ, kể cả ngắn', () => {
    expect(texts(line(['zu', 96], ['Berlin,', 90], ['1779', 95]))).toEqual(['zu', 'Berlin,', '1779'])
  })
  it('từ ghép dài kém tin cậy nhưng đứng cạnh từ tốt (justified) được giữ', () => {
    expect(texts(line(['Förderung', 96], ['der', 68], ['Wirtschaft', 85], ['den', 61], ['hochverschuldeten', 28]))).toContain('hochverschuldeten')
  })
  it('chữ ghi chú dính sau từ bị đọc thành rác thì cắt phần rác, giữ từ', () => {
    expect(texts(line(['hervorzubringen.“S9l', 24], ['Durch', 96], ['Reisen', 96]))).toEqual(['hervorzubringen.“', 'Durch', 'Reisen'])
    expect(texts(line(['Weimarer', 91], ['Armee.S71', 0], ['Sein', 95]))).toEqual(['Weimarer', 'Armee.', 'Sein'])
  })
  it('nhiễu từ hình vẽ: từ ngắn, toàn chữ hoa, ký hiệu, hay cả cụm lẻ loi kém tin cậy bị bỏ', () => {
    expect(texts(line(['machte', 96], ['pe', 38], ['Life', 0], ['$', 0], ['7', 76 - 50], ['SAN', 23], ['EDEL', 30]))).toEqual(['machte'])
    // cụm lẻ loi: không có từ tin cậy trong vòng 2 vị trí nên từ dài cũng bị bỏ
    expect(texts(line(['Silhouette', 30], ['Zeichnung', 25], ['Schatten', 28], ['Umriss', 20]))).toEqual([])
  })
  it('từ dài toàn chữ hoa kém tin cậy (nhiễu) bị bỏ dù cạnh từ tốt', () => {
    expect(texts(line(['machte', 96], ['EDELWEISS', 35], ['mit', 96]))).toEqual(['machte', 'mit'])
  })
})
