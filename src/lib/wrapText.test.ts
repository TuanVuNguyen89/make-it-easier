import { describe, expect, it } from 'vitest'
import { wrapParagraphs } from './wrapText'

const m = (s: string) => s.length * 10 // mỗi ký tự rộng 10

describe('wrapParagraphs', () => {
  it('ngắt theo từ khi vượt bề rộng, giữ nguyên thứ tự', () => {
    expect(wrapParagraphs('aaa bbb ccc ddd', m, 80)).toEqual(['aaa bbb', 'ccc ddd'])
    expect(wrapParagraphs('aaa bbb ccc ddd', m, 1000)).toEqual(['aaa bbb ccc ddd'])
  })
  it('ký tự xuống dòng luôn tách dòng; dòng trống được giữ', () => {
    expect(wrapParagraphs('a\n\nb', m, 100)).toEqual(['a', '', 'b'])
  })
  it('từ dài hơn bề rộng bị ngắt theo ký tự, không mất chữ', () => {
    const lines = wrapParagraphs('abcdefghijkl mm', m, 50)
    expect(lines.join('').replace(/\s/g, '')).toBe('abcdefghijklmm') // không mất chữ (khoảng trắng giữa kl và mm được giữ vì chúng vừa một dòng)
    expect(lines.every((l) => m(l) <= 50)).toBe(true)
  })
  it('bề rộng ≤ 0 hoặc vô hạn thì không ngắt', () => {
    expect(wrapParagraphs('a b c', m, 0)).toEqual(['a b c'])
    expect(wrapParagraphs('a b c', m, Infinity)).toEqual(['a b c'])
  })
  it('không để khoảng trắng thừa ở cuối dòng', () => {
    expect(wrapParagraphs('aa bb cc', m, 50).every((l) => l === l.trimEnd())).toBe(true)
  })
})
