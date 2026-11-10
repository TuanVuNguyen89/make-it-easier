import { describe, expect, it } from 'vitest'
import { findShowOps, removeShowOps } from './pdfContent'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)

describe('findShowOps', () => {
  it('Tm + Tj: vị trí là điểm đặt Tm', () => {
    const ops = findShowOps(enc('BT /F1 12 Tf 1 0 0 1 60 760 Tm (Hello) Tj ET'))
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ op: 'Tj', x: 60, y: 760, reliable: true })
  })

  it('Td cộng dồn trong cùng BT; chuỗi hex và mảng TJ', () => {
    const ops = findShowOps(enc('BT 56.8 729.25 Td /F1 24 Tf<0102>Tj 0 -20 Td [<01>1<02>-3(ab)]TJ ET'))
    expect(ops.map((o) => [o.op, o.x, o.y])).toEqual([['Tj', 56.8, 729.25], ['TJ', 56.8, 709.25]])
  })

  it('CTM từ cm và q/Q được áp dụng đúng', () => {
    const ops = findShowOps(enc('q 2 0 0 2 10 20 cm BT 1 0 0 1 5 5 Tm (a) Tj ET Q BT 1 0 0 1 5 5 Tm (b) Tj ET'))
    expect(ops.map((o) => [o.x, o.y])).toEqual([[20, 30], [5, 5]]) // trong q: 5*2+10, 5*2+20; sau Q: về như cũ
  })

  it("T*, ' và \" xuống dòng theo TL", () => {
    const ops = findShowOps(enc("BT 14 TL 1 0 0 1 50 700 Tm (a) Tj T* (b) Tj (c) ' 1 2 (d) \" ET"))
    expect(ops.map((o) => [o.op, o.x, o.y, o.reliable])).toEqual([
      ['Tj', 50, 700, true],
      ['Tj', 50, 686, true],
      ["'", 50, 672, true],
      ['"', 50, 658, true],
    ])
  })

  it('lệnh vẽ chữ nối tiếp không đặt lại vị trí thì không tin cậy', () => {
    const ops = findShowOps(enc('BT 1 0 0 1 10 10 Tm (a) Tj (b) Tj 0 -12 Td (c) Tj ET'))
    expect(ops.map((o) => o.reliable)).toEqual([true, false, true])
  })

  it('bỏ qua từ điển, chuỗi có ngoặc/thoát, chú thích và nhóm nội dung đánh dấu', () => {
    const src = '/Text#20body<</MCID 1>>BDC q 0 0 0 rg BT 1 0 0 1 30 40 Tm (a \\(b\\) (nested) c) Tj ET Q EMC % (giả) Tj\nBT 1 0 0 1 7 8 Tm (z) Tj ET'
    const ops = findShowOps(enc(src))
    expect(ops.map((o) => [o.x, o.y])).toEqual([[30, 40], [7, 8]])
  })

  it('ảnh nội tuyến BI…ID…EI không bị hiểu nhầm là lệnh chữ', () => {
    const bin = 'BI /W 1 /H 1 /CS /G /BPC 8 ID \u0001Tj\u0002 (x) Tj EI BT 1 0 0 1 3 4 Tm (a) Tj ET'
    const ops = findShowOps(enc(bin))
    expect(ops.map((o) => [o.x, o.y])).toEqual([[3, 4]])
  })

  it('Tm đặt lại ma trận và độ tin cậy', () => {
    const ops = findShowOps(enc('BT 1 0 0 1 10 10 Tm (a) Tj 2 0 0 2 100 200 Tm (b) Tj ET'))
    expect(ops.map((o) => [o.x, o.y, o.reliable])).toEqual([[10, 10, true], [100, 200, true]])
  })
})

describe('removeShowOps', () => {
  it('xóa đúng lệnh khớp, giữ nguyên phần còn lại của luồng', () => {
    const src = enc('BT 1 0 0 1 10 10 Tm (keep) Tj 1 0 0 1 10 30 Tm (gone) Tj 1 0 0 1 10 50 Tm [(x)1(y)]TJ ET')
    const ops = findShowOps(src)
    const { bytes, removed } = removeShowOps(src, ops, (o) => o.y === 30 || o.y === 50)
    expect(removed).toHaveLength(2)
    const text = dec(bytes)
    expect(text).toContain('(keep) Tj')
    expect(text).not.toContain('gone')
    expect(text).not.toContain('[(x)')
    expect(findShowOps(bytes).map((o) => o.y)).toEqual([10]) // luồng còn lại vẫn đọc được
  })

  it("lệnh ' được thay bằng T* để dòng sau vẫn đúng chỗ", () => {
    const src = enc("BT 14 TL 1 0 0 1 50 700 Tm (a) Tj (b) ' (c) ' ET")
    const ops = findShowOps(src)
    const { bytes } = removeShowOps(src, ops, (o) => o.y === 686)
    const after = findShowOps(bytes)
    expect(after.map((o) => [o.op, o.y])).toEqual([['Tj', 700], ["'", 672]]) // dòng c vẫn ở 672
  })

  it('không đụng đến lệnh vị trí không tin cậy, không khớp thì giữ nguyên byte', () => {
    const src = enc('BT 1 0 0 1 10 10 Tm (a) Tj (b) Tj ET')
    const ops = findShowOps(src)
    const r = removeShowOps(src, ops, () => true)
    expect(r.removed).toHaveLength(1)
    expect(dec(r.bytes)).toContain('(b) Tj')
    const none = removeShowOps(src, ops, () => false)
    expect(none.bytes).toBe(src)
  })
})

describe('theo dõi phông và màu tô', () => {
  it('Tf đặt phông, g/rg/k đặt màu; áp dụng cho các lệnh vẽ chữ sau đó', () => {
    const ops = findShowOps(enc('BT /F1 12 Tf 1 0 0 rg 1 0 0 1 10 10 Tm (a) Tj /F2 9 Tf 0.5 g 1 0 0 1 10 30 Tm (b) Tj 0 0 0 1 k 1 0 0 1 10 50 Tm (c) Tj ET'))
    expect(ops.map((o) => [o.font, o.fill])).toEqual([['F1', [1, 0, 0]], ['F2', [0.5, 0.5, 0.5]], ['F2', [0, 0, 0]]])
  })
  it('mặc định là đen và chưa có phông; q/Q khôi phục cả phông lẫn màu', () => {
    const ops = findShowOps(enc('BT 1 0 0 1 5 5 Tm (a) Tj ET q /F1 10 Tf 0 0 1 rg BT 1 0 0 1 5 20 Tm (b) Tj ET Q BT 1 0 0 1 5 35 Tm (c) Tj ET'))
    expect(ops.map((o) => [o.font, o.fill])).toEqual([[null, [0, 0, 0]], ['F1', [0, 0, 1]], [null, [0, 0, 0]]])
  })
  it('phông và màu kéo dài qua BT/ET (không bị đặt lại)', () => {
    const ops = findShowOps(enc('/F1 12 Tf 0 1 0 rg BT 1 0 0 1 5 5 Tm (a) Tj ET BT 1 0 0 1 5 20 Tm (b) Tj ET'))
    expect(ops.map((o) => [o.font, o.fill])).toEqual([['F1', [0, 1, 0]], ['F1', [0, 1, 0]]])
  })
  it('scn/sc: số thuần hiểu được (xám, RGB, CMYK); có tên mẫu tô thì không xác định', () => {
    const ops = findShowOps(enc('BT 0.2 sc 1 0 0 1 5 5 Tm (a) Tj 1 0 0 scn 1 0 0 1 5 20 Tm (b) Tj /P1 scn 1 0 0 1 5 35 Tm (c) Tj 0 0 0 0 scn 1 0 0 1 5 50 Tm (d) Tj ET'))
    expect(ops.map((o) => o.fill)).toEqual([[0.2, 0.2, 0.2], [1, 0, 0], null, [1, 1, 1]])
  })
  it('tên tài nguyên có mã #xx được giải mã', () => {
    expect(findShowOps(enc('BT /Helvetica-7098480789 24 Tf 1 0 0 1 5 5 Tm (a) Tj ET'))[0]!.font).toBe('Helvetica-7098480789')
    expect(findShowOps(enc('BT /F#201 12 Tf 1 0 0 1 5 5 Tm (a) Tj ET'))[0]!.font).toBe('F 1')
  })
})

describe('findShowOps: chữ vô hình (Tr 3)', () => {
  it('đánh dấu chữ ở chế độ vẽ 3 và khôi phục sau Q', () => {
    const enc = (s: string) => new TextEncoder().encode(s)
    const ops = findShowOps(enc('BT /F1 10 Tf 10 20 Td (a) Tj ET q 3 Tr BT 10 40 Td (b) Tj ET Q BT 10 60 Td (c) Tj ET q BT 3 Tr 10 80 Td (d) Tj ET'))
    expect(ops.map((o) => o.invisible)).toEqual([false, true, false, true])
  })
})
