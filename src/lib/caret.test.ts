import { describe, expect, it } from 'vitest'
import { caretIndex } from './caret'

const m = (s: string) => s.length * 10
const g = { x: 100, baseline: 200, angle: 0, lineHeight: 20, wrapWidth: 0 }

describe('caretIndex', () => {
  it('một dòng: chọn ký tự có mép gần điểm bấm nhất', () => {
    const t = 'Hello World'
    expect(caretIndex(t, m, g, { x: 152, y: 200 })).toBe(5)
    expect(caretIndex(t, m, g, { x: 158, y: 200 })).toBe(6)
    expect(caretIndex(t, m, g, { x: 100, y: 200 })).toBe(0)
  })
  it('bấm trước đầu hoặc sau cuối thì con trỏ về đầu/cuối', () => {
    const t = 'Hello'
    expect(caretIndex(t, m, g, { x: 10, y: 200 })).toBe(0)
    expect(caretIndex(t, m, g, { x: 900, y: 200 })).toBe(5)
  })
  it('khối nhiều dòng: chọn dòng theo độ cao rồi ký tự theo vị trí ngang', () => {
    const t = 'aaa bbb ccc ddd' // bề rộng 80: "aaa bbb" / "ccc ddd"
    const gw = { ...g, wrapWidth: 80 }
    expect(caretIndex(t, m, gw, { x: 100, y: 200 })).toBe(0)
    expect(caretIndex(t, m, gw, { x: 100, y: 220 })).toBe(8) // đầu dòng 2 = trước "ccc"
    expect(caretIndex(t, m, gw, { x: 130, y: 220 })).toBe(11)
    expect(caretIndex(t, m, gw, { x: 130, y: 200 })).toBe(3)
  })
  it('dòng quá thấp hoặc quá cao được kẹp vào dòng đầu/cuối', () => {
    const gw = { ...g, wrapWidth: 80 }
    expect(caretIndex('aaa bbb ccc ddd', m, gw, { x: 100, y: 0 })).toBe(0)
    expect(caretIndex('aaa bbb ccc ddd', m, gw, { x: 100, y: 999 })).toBe(8)
  })
  it('xuống dòng thủ công được tính là một ký tự giữa hai dòng', () => {
    const t = 'ab\ncd'
    expect(caretIndex(t, m, g, { x: 100, y: 220 })).toBe(3)
    expect(caretIndex(t, m, g, { x: 120, y: 220 })).toBe(5)
  })
  it('chữ xoay 90° (đọc từ dưới lên): khoảng cách dọc theo chữ là trục dọc màn hình', () => {
    // angle 90 ngược chiều kim đồng hồ: chữ chạy lên trên; ký tự thứ 3 cách gốc 30 pt về phía trên.
    expect(caretIndex('Hello', m, { ...g, angle: 90 }, { x: 100, y: 170 })).toBe(3)
  })
  it('văn bản rỗng không lỗi', () => {
    expect(caretIndex('', m, g, { x: 150, y: 200 })).toBe(0)
  })
  it('căn giữa/phải: bù độ lệch đầu dòng', () => {
    const t = 'Hello' // rộng 50
    const center = { ...g, align: 'center' as const, blockWidth: 150 } // đầu dòng lệch 50
    expect(caretIndex(t, m, center, { x: 100 + 50 + 20, y: 200 })).toBe(2)
    const right = { ...g, align: 'right' as const, blockWidth: 150 } // lệch 100
    expect(caretIndex(t, m, right, { x: 100 + 100 + 30, y: 200 })).toBe(3)
  })
})
