import { describe, expect, it } from 'vitest'
import { parseRangeGroups, parseRanges } from './ranges'

describe('parseRanges', () => {
  it('đọc số đơn, khoảng và khoảng mở', () => {
    expect(parseRanges('1-3, 5, 8-', 10)).toEqual([0, 1, 2, 4, 7, 8, 9])
  })
  it('giữ thứ tự người dùng nhập', () => {
    expect(parseRanges('5, 1-2', 5)).toEqual([4, 0, 1])
  })
  it('tách thành nhóm', () => {
    expect(parseRangeGroups('1-3, 4-10', 10)).toEqual([[0, 1, 2], [3, 4, 5, 6, 7, 8, 9]])
  })
  it('chấp nhận khoảng trắng', () => {
    expect(parseRanges(' 2 - 4 ,6 ', 6)).toEqual([1, 2, 3, 5])
  })
  it.each(['', ' , ', '0', '11', '3-2', '1-11', 'a', '1--2', '-3', '1.5'])('từ chối %j', (s) => {
    expect(() => parseRanges(s, 10)).toThrowError(expect.objectContaining({ code: 'invalid-options' }))
  })
})
