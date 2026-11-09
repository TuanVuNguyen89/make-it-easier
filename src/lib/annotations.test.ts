import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import { applyAnnotations, type Annotation } from './annotations'
import { decodeImage } from './image'
import { rasterizePdf } from './pdfRaster'
import type { Bitmap } from './imageOps'
import { pageTexts } from '@/tools/testUtils'

const signal = new AbortController().signal

async function blank(pages = 1, rotation = 0, size: [number, number] = [300, 200]) {
  const d = await PDFDocument.create()
  for (let i = 0; i < pages; i++) d.addPage(size).setRotation(degrees(rotation))
  return d.save()
}
async function render(bytes: Uint8Array, page = 0): Promise<Bitmap> {
  let png: Uint8Array | undefined
  await rasterizePdf(bytes, { dpi: 72, format: 'png' }, (i, _t, data) => { if (i === page) png = data }, signal)
  return decodeImage(png!)
}
const px = (b: Bitmap, x: number, y: number) => [...b.data.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 3)]
const near = (a: number[], b: number[], tol = 12) => a.every((v, i) => Math.abs(v - b[i]!) <= tol)
const apply = (bytes: Uint8Array, ann: Annotation[]) => applyAnnotations(bytes, ann, signal, () => {})
const base = { id: 'a', page: 0 }
const RED = '#ff0000'

describe('applyAnnotations: hình dạng (trang không xoay)', () => {
  it('ô trắng che chữ thật sự (điểm ảnh đen thành trắng)', async () => {
    const d = await PDFDocument.create()
    const f = await d.embedFont(StandardFonts.HelveticaBold)
    d.addPage([300, 200]).drawText('HELLO', { x: 40, y: 100, size: 60, font: f, color: rgb(0, 0, 0) })
    const src = await d.save()
    const before = await render(src)
    const dark = (b: Bitmap) => { let n = 0; for (let y = 60; y < 110; y++) for (let x = 40; x < 250; x++) if (px(b, x, y)[0]! < 100) n++; return n }
    expect(dark(before)).toBeGreaterThan(300)
    const out = await apply(src, [{ ...base, type: 'whiteout', x: 30, y: 50, w: 230, h: 70 }])
    expect(dark(await render(out))).toBe(0)
  })

  it('tô sáng: vùng chuyển sang màu vàng nhưng chữ bên dưới vẫn đọc được (nhân màu)', async () => {
    const d = await PDFDocument.create()
    const f = await d.embedFont(StandardFonts.HelveticaBold)
    d.addPage([300, 200]).drawText('MARK', { x: 40, y: 100, size: 60, font: f, color: rgb(0, 0, 0) })
    const out = await apply(await d.save(), [{ ...base, type: 'highlight', x: 20, y: 20, w: 100, h: 40, color: '#ffeb3b' }])
    const b = await render(out)
    const p = px(b, 30, 30) // vùng tô sáng, không có chữ
    expect(p[0]).toBeGreaterThan(240)
    expect(p[2]).toBeLessThan(235) // đã ngả vàng so với trắng
    expect(px(b, 200, 30)).toEqual([255, 255, 255]) // ngoài vùng giữ trắng
    // chữ bên dưới vùng tô sáng vẫn tối (không bị che)
    let dark = 0
    for (let y = 60; y < 110; y++) for (let x = 40; x < 150; x++) if (px(b, x, y)[0]! < 100) dark++
    expect(dark).toBeGreaterThan(100)
  })

  it('hình chữ nhật: viền đúng vị trí, bên trong trắng; có tô thì đặc', async () => {
    const out = await apply(await blank(), [{ ...base, type: 'rect', x: 100, y: 60, w: 100, h: 60, color: RED, width: 4, fill: false }])
    const b = await render(out)
    expect(near(px(b, 100, 90), [255, 0, 0], 40)).toBe(true) // trên cạnh trái
    expect(near(px(b, 150, 60), [255, 0, 0], 40)).toBe(true) // trên cạnh trên
    expect(px(b, 150, 90)).toEqual([255, 255, 255])
    expect(px(b, 50, 90)).toEqual([255, 255, 255])
    const filled = await render(await apply(await blank(), [{ ...base, type: 'rect', x: 100, y: 60, w: 100, h: 60, color: RED, width: 2, fill: true }]))
    expect(near(px(filled, 150, 90), [255, 0, 0])).toBe(true)
  })

  it('elip: tô đặc ở tâm, góc của khung bao vẫn trắng', async () => {
    const b = await render(await apply(await blank(), [{ ...base, type: 'ellipse', x: 100, y: 50, w: 100, h: 100, color: '#0000ff', width: 2, fill: true }]))
    expect(near(px(b, 150, 100), [0, 0, 255])).toBe(true)
    expect(px(b, 103, 53)).toEqual([255, 255, 255])
  })

  it('đường thẳng và mũi tên', async () => {
    const line = await render(await apply(await blank(), [{ ...base, type: 'line', x1: 20, y1: 100, x2: 220, y2: 100, color: '#000000', width: 4 }]))
    expect(px(line, 120, 100)[0]).toBeLessThan(60)
    expect(px(line, 120, 130)).toEqual([255, 255, 255])
    const arrow = await render(await apply(await blank(), [{ ...base, type: 'arrow', x1: 20, y1: 100, x2: 220, y2: 100, color: '#000000', width: 3 }]))
    // đầu mũi tên nằm gần điểm cuối, hai cánh lệch lên/xuống so với thân
    let wing = 0
    for (let x = 205; x < 220; x++) { if (px(arrow, x, 94)[0]! < 120) wing++; if (px(arrow, x, 106)[0]! < 120) wing++ }
    expect(wing).toBeGreaterThan(2)
  })

  it('nét vẽ tay đi qua các điểm', async () => {
    const pts: [number, number][] = [[30, 30], [80, 80], [130, 30], [180, 80]]
    const b = await render(await apply(await blank(), [{ ...base, type: 'ink', points: pts, color: '#000000', width: 5 }]))
    expect(px(b, 55, 55)[0]).toBeLessThan(90)
    expect(px(b, 105, 55)[0]).toBeLessThan(90)
    expect(px(b, 55, 100)).toEqual([255, 255, 255])
  })

  it('chấm đơn lẻ (một điểm) vẫn hiện', async () => {
    const b = await render(await apply(await blank(), [{ ...base, type: 'ink', points: [[100, 100]], color: '#000000', width: 10 }]))
    expect(px(b, 100, 100)[0]).toBeLessThan(80)
  })

  it('hộp kiểm: viền, và dấu tích chỉ khi chọn', async () => {
    const off = await render(await apply(await blank(), [{ ...base, type: 'checkbox', x: 50, y: 50, size: 40, checked: false, color: '#000000' }]))
    const on = await render(await apply(await blank(), [{ ...base, type: 'checkbox', x: 50, y: 50, size: 40, checked: true, color: '#000000' }]))
    const dark = (b: Bitmap) => { let n = 0; for (let y = 55; y < 85; y++) for (let x = 55; x < 85; x++) if (px(b, x, y)[0]! < 100) n++; return n }
    expect(px(off, 50, 70)[0]).toBeLessThan(100) // viền trái
    expect(dark(off)).toBe(0)
    expect(dark(on)).toBeGreaterThan(20)
  })

  it('ảnh PNG/JPG đặt đúng khung', async () => {
    const png = new Uint8Array(readFileSync('tests/fixtures/image-red.png'))
    const b = await render(await apply(await blank(), [{ ...base, type: 'image', x: 100, y: 50, w: 80, h: 60, data: png }]))
    expect(near(px(b, 110, 60), [200, 60, 60], 20)).toBe(true) // phần đỏ ngoài viền trắng của ảnh mẫu
    expect(px(b, 90, 60)).toEqual([255, 255, 255])
    expect(px(b, 150, 130)).toEqual([255, 255, 255])
    const jpg = new Uint8Array(readFileSync('tests/fixtures/image-blue.jpg'))
    const b2 = await render(await apply(await blank(), [{ ...base, type: 'image', x: 10, y: 10, w: 80, h: 60, data: jpg }]))
    expect(near(px(b2, 15, 15), [40, 90, 190], 25)).toBe(true)
  })
})

describe('applyAnnotations: chữ', () => {
  it('chữ đúng nội dung (kể cả tiếng Việt, nhiều dòng) và đúng vị trí', async () => {
    const out = await apply(await blank(), [{ ...base, type: 'text', x: 40, y: 50, text: 'Xin chào Việt Nam\nDòng hai', size: 20, color: '#000000' }])
    const items = (await pageTexts(out))[0]!
    const joined = items.map((i) => i.str).join('|')
    expect(joined).toContain('Xin chào Việt Nam')
    expect(joined).toContain('Dòng hai')
    const first = items.find((i) => i.str.includes('Xin'))!
    expect(first.x).toBeCloseTo(40, 0)
    // dòng đầu ở cao hơn dòng hai (y PDF lớn hơn)
    expect(first.y).toBeGreaterThan(items.find((i) => i.str.includes('Dòng'))!.y)
    // và nằm khoảng 50..75 tính từ mép trên (trang cao 200)
    expect(200 - first.y).toBeGreaterThan(55)
    expect(200 - first.y).toBeLessThan(80)
  })
})

describe('applyAnnotations: trang xoay', () => {
  for (const rot of [90, 180, 270]) {
    it(`xoay ${rot}°: chú thích ở góc trên-trái nhìn thấy hiện đúng ở góc trên-trái`, async () => {
      const src = await blank(1, rot)
      const probe = await render(src)
      const out = await apply(src, [{ ...base, type: 'rect', x: 10, y: 10, w: 40, h: 20, color: RED, width: 1, fill: true }])
      const b = await render(out)
      expect([b.width, b.height]).toEqual([probe.width, probe.height])
      expect(near(px(b, 20, 18), [255, 0, 0])).toBe(true)
      expect(px(b, b.width - 20, b.height - 20)).toEqual([255, 255, 255])
      expect(px(b, b.width - 20, 18)).toEqual([255, 255, 255])
    })
    it(`xoay ${rot}°: ảnh và chữ đứng đúng hướng nhìn thấy`, async () => {
      const png = new Uint8Array(readFileSync('tests/fixtures/image-red.png'))
      const src = await blank(1, rot)
      const out = await apply(src, [
        { ...base, type: 'image', x: 10, y: 10, w: 60, h: 40, data: png },
        { ...base, type: 'text', x: 10, y: 80, text: 'Hello', size: 24, color: '#000000' },
      ])
      const b = await render(out)
      expect(near(px(b, 20, 20), [200, 60, 60], 25)).toBe(true)
      expect(px(b, b.width - 20, b.height - 20)).toEqual([255, 255, 255])
      // chữ nằm trong dải 80..110 phía dưới ảnh, bên trái: có điểm tối ở đó
      let dark = 0
      for (let y = 80; y < 112; y++) for (let x = 10; x < 80; x++) if (px(b, x, y)[0]! < 110) dark++
      expect(dark).toBeGreaterThan(40)
    })
  }
})

describe('applyAnnotations: nhiều trang và lỗi', () => {
  it('chỉ trang được chỉ định bị thay đổi; bản gốc không đổi', async () => {
    const src = await blank(3)
    const copy = src.slice()
    const out = await apply(src, [{ ...base, page: 1, type: 'rect', x: 0, y: 0, w: 300, h: 200, color: RED, width: 1, fill: true }])
    expect(near(px(await render(out, 1), 150, 100), [255, 0, 0])).toBe(true)
    expect(px(await render(out, 0), 150, 100)).toEqual([255, 255, 255])
    expect(px(await render(out, 2), 150, 100)).toEqual([255, 255, 255])
    expect(src).toEqual(copy)
  })
  it('thứ tự vẽ: thành phần sau nằm trên thành phần trước', async () => {
    const out = await apply(await blank(), [
      { ...base, id: '1', type: 'rect', x: 50, y: 50, w: 100, h: 100, color: RED, width: 1, fill: true },
      { ...base, id: '2', type: 'whiteout', x: 80, y: 80, w: 40, h: 40 },
    ])
    const b = await render(out)
    expect(near(px(b, 60, 60), [255, 0, 0])).toBe(true)
    expect(px(b, 100, 100)).toEqual([255, 255, 255])
  })
  it('đầu vào không hợp lệ bị từ chối', async () => {
    const src = await blank()
    await expect(apply(src, [])).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(apply(src, [{ ...base, page: 5, type: 'whiteout', x: 0, y: 0, w: 1, h: 1 }])).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(apply(src, [{ ...base, type: 'whiteout', x: NaN, y: 0, w: 1, h: 1 }])).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(apply(src, [{ ...base, type: 'rect', x: 0, y: 0, w: 1, h: 1, color: 'red', width: 1, fill: false }])).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(apply(src, [{ ...base, type: 'image', x: 0, y: 0, w: 5, h: 5, data: new Uint8Array([1, 2, 3]) }])).rejects.toMatchObject({ code: 'invalid-image' })
  })
  it('PDF có mật khẩu: encrypted; hủy: aborted', async () => {
    await expect(apply(new Uint8Array(readFileSync('tests/fixtures/encrypted-secret.pdf')), [{ ...base, type: 'whiteout', x: 0, y: 0, w: 1, h: 1 }])).rejects.toMatchObject({ code: 'encrypted' })
    const ac = new AbortController()
    ac.abort()
    await expect(applyAnnotations(await blank(), [{ ...base, type: 'whiteout', x: 0, y: 0, w: 1, h: 1 }], ac.signal, () => {})).rejects.toMatchObject({ code: 'aborted' })
  })
})

// ---- Sửa chữ có sẵn ----
import { extractPdfText } from './pdfText'
import { buildBlocks, segmentCorners } from './textSegments'
const segs0Angle = (s: { angle: number }) => s.angle

type EditAnn = Extract<Annotation, { type: 'textEdit' }>

async function textPdf(draw: (t: (s: string, x: number, yTop: number, size?: number) => void) => void, rotation = 0, pages = 1) {
  const d = await PDFDocument.create()
  const font = await d.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const p = d.addPage([400, 300])
    p.setRotation(degrees(rotation))
    draw((s, x, yTop, size = 20) => p.drawText(s, { x, y: 300 - yTop - size, size, font, color: rgb(0, 0, 0) }))
  }
  return d.save()
}
const segmentsOf = async (bytes: Uint8Array, page = 0) => buildBlocks((await extractPdfText(bytes, signal))[page]!)
const edit = (seg: Awaited<ReturnType<typeof segmentsOf>>[number], text: string, over: Partial<EditAnn> = {}, page = 0): EditAnn => ({
  id: `e${Math.random()}`, page, type: 'textEdit', x: seg.x, baseline: seg.baseline, angle: seg.angle, w: seg.w, h: seg.h, lines: seg.lines, lineHeight: seg.lineHeight, original: seg.text, text, size: seg.size, color: '#000000', family: 'sans', bold: false, italic: false, parts: seg.parts, ...over,
})
const textOf = async (b: Uint8Array, page = 0) => (await pageTexts(b))[page]!.map((i) => i.str).join(' ')
const applyD = (b: Uint8Array, a: Annotation[]) => applyAnnotationsDetailed(b, a, signal, () => {})
import { applyAnnotationsDetailed } from './annotations'

describe('sửa chữ có sẵn: xóa thật chữ gốc rồi vẽ chữ mới', () => {
  it('chữ gốc biến mất hẳn khỏi tệp (không còn trích xuất được), chữ mới ở đúng chỗ, không cần ô trắng', async () => {
    const src = await textPdf((t) => t('Hello World', 40, 60, 24))
    const [seg] = await segmentsOf(src)
    expect(seg!.text).toBe('Hello World')
    const { bytes, warnings } = await applyD(src, [edit(seg!, 'Xin chào Việt Nam')])
    expect(warnings).toEqual([])
    const text = await textOf(bytes)
    expect(text).toContain('Xin chào Việt Nam')
    expect(text).not.toContain('Hello')
    expect(text).not.toContain('World')
    const out = (await pageTexts(bytes))[0]![0]!
    expect(out.x).toBeCloseTo(seg!.x, 0) // cùng mép trái
    expect(300 - out.y).toBeCloseTo(seg!.baseline, 0) // cùng đường cơ sở
  })

  it('điểm ảnh: vùng chữ cũ chỉ còn chữ mới (không lộ chữ cũ dù chữ mới ngắn hơn)', async () => {
    const src = await textPdf((t) => t('LONG ORIGINAL TEXT', 20, 60, 30))
    const [seg] = await segmentsOf(src)
    const { bytes } = await applyD(src, [edit(seg!, 'Hi', { size: 30 })])
    const b = await render(bytes)
    // phần bên phải (nơi chữ cũ dài hơn chữ mới) phải trắng hoàn toàn
    let dark = 0
    for (let y = Math.floor(seg!.baseline - seg!.size); y < seg!.baseline + seg!.size * 0.3; y++) for (let x = Math.floor(seg!.x + 80); x < seg!.x + seg!.w; x++) if (px(b, x, y)[0]! < 140) dark++
    expect(dark).toBe(0)
  })

  it('nhiều đoạn chữ rời nhau trên cùng dòng gộp thành một khung: sửa là xóa hết các đoạn gốc', async () => {
    const src = await textPdf((t) => { t('Hello', 40, 60, 20); t('World', 100, 60, 20) })
    const segs = await segmentsOf(src)
    expect(segs).toHaveLength(1)
    expect(segs[0]!.parts.length).toBe(1) // hai lệnh, một phần (cùng đường cơ sở)
    const { bytes, warnings } = await applyD(src, [edit(segs[0]!, 'Thay thế')])
    expect(warnings).toEqual([])
    const text = await textOf(bytes)
    expect(text).toContain('Thay thế')
    expect(text).not.toMatch(/Hello|World/)
  })

  it('hai khung trên cùng trang, và chỉ sửa một trong hai: khung kia giữ nguyên', async () => {
    const src = await textPdf((t) => { t('Dong thu nhat', 40, 40, 20); t('Dong thu hai', 40, 120, 20) })
    const segs = await segmentsOf(src)
    expect(segs.map((s) => s.text)).toEqual(['Dong thu nhat', 'Dong thu hai'])
    const { bytes } = await applyD(src, [edit(segs[1]!, 'Dòng đã sửa')])
    const text = await textOf(bytes)
    expect(text).toContain('Dòng đã sửa')
    expect(text).not.toContain('Dong thu hai')
    expect(text).toContain(segs[0]!.text) // dòng đầu vẫn nguyên
  })

  it('xóa chữ (nội dung rỗng): chữ gốc biến mất và không vẽ gì thêm', async () => {
    const src = await textPdf((t) => { t('Giu lai', 40, 40, 20); t('Xoa dong nay', 40, 120, 20) })
    const segs = await segmentsOf(src)
    const { bytes, warnings } = await applyD(src, [edit(segs[1]!, '')])
    expect(warnings).toEqual([])
    const text = await textOf(bytes)
    expect(text).not.toContain('Xoa')
    expect(text).toContain(segs[0]!.text)
  })

  it('đoạn không đổi nội dung thì bỏ qua hoàn toàn (tệp vẫn giữ chữ gốc)', async () => {
    const src = await textPdf((t) => t('Khong doi', 40, 60, 20))
    const [seg] = await segmentsOf(src)
    const { bytes, warnings } = await applyD(src, [edit(seg!, seg!.text)])
    expect(warnings).toEqual([])
    expect(await textOf(bytes)).toContain(seg!.text)
  })

  it('chỉ trang được sửa bị đổi; trang khác nguyên vẹn', async () => {
    const src = await textPdf((t) => t('Trang chung', 40, 60, 20), 0, 2)
    const segs1 = await segmentsOf(src, 1)
    const { bytes } = await applyD(src, [edit(segs1[0]!, 'Trang hai đã sửa', {}, 1)])
    expect(await textOf(bytes, 0)).toContain('Trang chung')
    expect(await textOf(bytes, 1)).toContain('Trang hai đã sửa')
    expect(await textOf(bytes, 1)).not.toContain('Trang chung')
  })

  for (const rot of [90, 180, 270]) {
    it(`trang xoay ${rot}°: xóa đúng chữ gốc và chữ mới hiện ở chỗ cũ`, async () => {
      const src = await textPdf((t) => t('Original line', 40, 60, 24), rot)
      const [seg] = await segmentsOf(src)
      const { bytes, warnings } = await applyD(src, [edit(seg!, 'Edited line')])
      expect(warnings).toEqual([])
      const text = await textOf(bytes)
      expect(text).toContain('Edited line')
      expect(text).not.toContain('Original')
      // chữ mới giữ đúng hướng và vị trí của chữ gốc: có điểm tối trong khung bao (đã tính hướng chữ)
      const corners = segmentCorners(seg!)
      const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1])
      const b = await render(bytes)
      let dark = 0
      for (let y = Math.floor(Math.min(...ys)); y < Math.max(...ys); y++) for (let x = Math.floor(Math.min(...xs)); x < Math.max(...xs); x++) if (px(b, x, y)[0]! < 120) dark++
      expect(dark).toBeGreaterThan(40)
      // và chữ gốc đã được xóa ở tầng nội dung (không chỉ bị phủ)
      expect(segs0Angle(seg!)).toBe(seg!.angle)
    })
  }

  it('phông tương đương có đủ tiếng Việt: chữ có dấu dùng thẳng phông sans/serif/mono, không phải rơi về phông khác', async () => {
    const src = await textPdf((t) => t('Hello', 40, 60, 24))
    const [seg] = await segmentsOf(src)
    for (const family of ['sans', 'serif', 'mono'] as const) {
      const { bytes, warnings } = await applyD(src, [edit(seg!, 'Tiếng Việt: ệ ẫ ơ ư đ', { family })])
      expect(warnings, family).toEqual([])
      expect(await textOf(bytes), family).toContain('Tiếng Việt: ệ ẫ ơ ư đ')
    }
  })

  it('ký tự phông được chọn không có (biểu tượng) thì tự dùng DejaVu cho đoạn đó và báo font-fallback', async () => {
    const src = await textPdf((t) => t('Hello', 40, 60, 24))
    const [seg] = await segmentsOf(src)
    const { bytes, warnings } = await applyD(src, [edit(seg!, 'Tuyết ☃ rơi', { family: 'serif' })])
    expect(warnings).toEqual(['font-fallback'])
    expect(await textOf(bytes)).toContain('☃')
  })

  it('chữ nằm trong Form XObject (PDF ghép từ trang khác): không xóa được, phủ ô trắng lên và báo edit-cover-only', async () => {
    const inner = await textPdf((t) => t('Hello World', 40, 60, 24))
    const dst = await PDFDocument.create()
    const [embedded] = await dst.embedPdf(inner)
    dst.addPage([400, 300]).drawPage(embedded!)
    const src = await dst.save()
    const [seg] = await segmentsOf(src)
    expect(seg!.text).toBe('Hello World') // pdf.js vẫn đọc được chữ trong XObject
    const { bytes, warnings } = await applyD(src, [edit(seg!, 'Ok')])
    expect(warnings).toEqual(['edit-cover-only'])
    expect(await textOf(bytes)).toContain('Ok')
    // nhìn bằng mắt thì chữ cũ đã bị che (phần bên phải nơi chữ mới 'Ok' không tới)
    const b = await render(bytes)
    let dark = 0
    for (let y = Math.floor(seg!.baseline - seg!.size); y < seg!.baseline + seg!.size * 0.3; y++) for (let x = Math.floor(seg!.x + seg!.w * 0.5); x < seg!.x + seg!.w; x++) if (px(b, x, y)[0]! < 140) dark++
    expect(dark).toBe(0)
  })

  it('lệnh chữ nối tiếp không đặt lại vị trí (không đo được): phủ lên và báo edit-cover-only', async () => {
    const d = await PDFDocument.create()
    d.addPage([400, 300])
    const page = d.getPage(0)
    const font = await d.embedFont(StandardFonts.Helvetica)
    page.drawText('AAA', { x: 40, y: 200, size: 20, font })
    const src = await d.save()
    // Ghi đè luồng nội dung bằng hai lệnh Tj liền nhau trong cùng BT.
    const doc2 = await PDFDocument.load(src)
    const stream = doc2.context.flateStream(new Uint8Array(new TextEncoder().encode('BT /F1 20 Tf 1 0 0 1 40 200 Tm (AAA) Tj (BBB) Tj ET')))
    doc2.getPage(0).node.set((await import('pdf-lib')).PDFName.of('Contents'), doc2.context.register(stream))
    const chained = await doc2.save()
    const segs = await segmentsOf(chained)
    expect(segs.length).toBeGreaterThanOrEqual(1)
    const target = segs.find((s) => s.text.includes('BBB')) ?? segs[0]!
    const { warnings } = await applyD(chained, [edit(target, 'Mới')])
    expect(warnings).toContain('edit-cover-only')
  })

  it('pdf.js gộp hai lệnh vẽ chữ sát nhau thành một đoạn: sửa phải xóa CẢ HAI lệnh (không sót nửa sau)', async () => {
    const src = await textPdf((t) => { t('gach dau', 40, 100, 14); t('dong', 105, 100, 14) })
    const segs = await segmentsOf(src)
    expect(segs).toHaveLength(1)
    expect(segs[0]!.parts).toHaveLength(1) // pdf.js đã gộp: chỉ có một phần dù tệp có hai lệnh vẽ chữ
    const { bytes, warnings } = await applyD(src, [edit(segs[0]!, 'thay the')])
    expect(warnings).toEqual([])
    const text = await textOf(bytes)
    expect(text).toContain('thay the')
    expect(text).not.toMatch(/gach|dau|dong/)
  })

  it('đầu vào sai bị từ chối: phông lạ, không có origin, tọa độ không hữu hạn', async () => {
    const src = await textPdf((t) => t('Hello', 40, 60, 24))
    const [seg] = await segmentsOf(src)
    await expect(applyD(src, [edit(seg!, 'x', { family: 'comic' as never })])).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(applyD(src, [edit(seg!, 'x', { bold: 'yes' as never })])).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(applyD(src, [edit(seg!, 'x', { parts: [] })])).rejects.toMatchObject({ code: 'invalid-options' })
    await expect(applyD(src, [edit(seg!, 'x', { baseline: NaN })])).rejects.toMatchObject({ code: 'invalid-options' })
  })
})

describe('buildSegments', () => {
  it('các đoạn xa nhau (cột bảng) là các khung riêng; đoạn sát nhau trên một dòng được gộp', async () => {
    const src = await textPdf((t) => { t('Ten', 40, 60, 14); t('So luong', 220, 60, 14); t('Gia', 330, 60, 14); t('gach dau', 40, 100, 14); t('dong', 105, 100, 14) })
    const segs = await segmentsOf(src)
    expect(segs.map((s) => s.text)).toEqual(['Ten', 'So luong', 'Gia', 'gach dau dong'])
  })
})

// ---- Khối đoạn văn nhiều dòng ----
const PARA = ['The quick brown fox jumps over', 'the lazy dog and keeps running', 'across the wide open field today']
const paraPdf = (extra?: (t: (s: string, x: number, yTop: number, size?: number) => void) => void) =>
  textPdf((t) => {
    t('Heading Line', 40, 40, 24)
    PARA.forEach((l, i) => t(l, 40, 100 + i * 18, 14))
    t('Next paragraph far below', 40, 220, 14)
    extra?.(t)
  })

describe('khối đoạn văn nhiều dòng', () => {
  it('các dòng liền nhau cùng căn lề thành MỘT khối; tiêu đề (khác cỡ) và đoạn cách xa là khối riêng', async () => {
    const blocks = await segmentsOf(await paraPdf())
    expect(blocks.map((b) => b.text)).toEqual(['Heading Line', PARA.join(' '), 'Next paragraph far below'])
    const para = blocks[1]!
    expect(para.lines).toBe(3)
    expect(para.parts).toHaveLength(3)
    expect(para.lineHeight).toBeCloseTo(18, 0)
    expect(para.h).toBeGreaterThan(18 * 2)
  })

  it('dòng đầu mục danh sách bắt đầu khối mới; chữ cột bên phải cùng hàng không bị gộp', async () => {
    const src = await textPdf((t) => {
      t('Intro line one is long enough here', 40, 100, 14)
      t('- bullet starts a new block here ok', 40, 118, 14)
      t('Cell A', 40, 200, 14)
      t('Cell B', 300, 200, 14)
      t('Cell A below it', 40, 218, 14)
    })
    const texts = (await segmentsOf(src)).map((b) => b.text)
    expect(texts).toContain('Intro line one is long enough here')
    expect(texts).toContain('- bullet starts a new block here ok')
    expect(texts).toContain('Cell B')
    expect(texts.some((x) => x.includes('Cell A') && x.includes('Cell B'))).toBe(false)
  })

  it('sửa cả đoạn: mọi dòng cũ biến mất, chữ mới tự xuống dòng trong bề rộng khối, đoạn khác nguyên vẹn', async () => {
    const src = await paraPdf()
    const [, para] = await segmentsOf(src)
    const next = 'Short replacement text that is deliberately written long enough to wrap onto more than one line inside the block'
    const { bytes, warnings } = await applyD(src, [edit(para!, next)])
    expect(warnings).toEqual([])
    const items = (await pageTexts(bytes))[0]!
    const all = items.map((i) => i.str).join(' ')
    for (const old of ['quick', 'lazy', 'wide open']) expect(all).not.toContain(old) // ba dòng cũ đều bị xóa
    expect(all).toContain('Heading Line')
    expect(all).toContain('Next paragraph far below')
    // chữ mới nằm trên nhiều dòng, mỗi dòng không vượt bề rộng khối và cách nhau đúng lineHeight
    const mine = items.filter((i) => i.y < 300 - 95 && i.y > 300 - 215)
    const ys = [...new Set(mine.map((i) => Math.round(i.y)))].sort((a, b) => b - a)
    expect(ys.length).toBeGreaterThanOrEqual(2)
    expect(ys[0]! - ys[1]!).toBeCloseTo(para!.lineHeight, 0)
    const right = Math.max(...mine.map((i) => i.x + i.size * 0.5 * i.str.length))
    expect(right).toBeLessThan(para!.x + para!.w + 30)
    expect(all.replace(/\s+/g, ' ')).toContain('Short replacement')
    expect(all).toContain('inside the block')
  })

  it('đoạn mới ngắn hơn: chỉ còn một dòng, không sót dòng cũ', async () => {
    const src = await paraPdf()
    const [, para] = await segmentsOf(src)
    const { bytes, warnings } = await applyD(src, [edit(para!, 'Tiny')])
    expect(warnings).toEqual([])
    const all = (await pageTexts(bytes))[0]!.map((i) => i.str).join(' ')
    expect(all).toContain('Tiny')
    expect(all).not.toMatch(/quick|lazy|field/)
  })

  it('xuống dòng thủ công trong ô sửa được tôn trọng', async () => {
    const src = await paraPdf()
    const [, para] = await segmentsOf(src)
    const { bytes } = await applyD(src, [edit(para!, 'Line A\nLine B\nLine C')])
    const items = (await pageTexts(bytes))[0]!
    const ys = ['Line A', 'Line B', 'Line C'].map((t) => items.find((i) => i.str.includes(t))!.y)
    expect(ys[0]! > ys[1]! && ys[1]! > ys[2]!).toBe(true)
  })

  it('một phần không tìm thấy lệnh (chữ nằm trong XObject): không xóa gì, phủ lên từng dòng và báo cảnh báo', async () => {
    const inner = await paraPdf()
    const dst = await PDFDocument.create()
    const [emb] = await dst.embedPdf(inner)
    dst.addPage([400, 300]).drawPage(emb!)
    const src = await dst.save()
    const [, para] = await segmentsOf(src)
    const { bytes, warnings } = await applyD(src, [edit(para!, 'Ok')])
    expect(warnings).toEqual(['edit-cover-only'])
    const b = await render(bytes)
    // cả ba dòng cũ đều đã bị phủ trắng ở phần bên phải (nơi chữ 'Ok' không tới)
    let dark = 0
    for (let y = Math.floor(para!.baseline - para!.size); y < para!.baseline + para!.lineHeight * 2 + 4; y++) for (let x = Math.floor(para!.x + para!.w * 0.5); x < para!.x + para!.w; x++) if (px(b, x, y)[0]! < 140) dark++
    expect(dark).toBe(0)
  })

  it('hai hàng của một cột bảng (ô ngắn, thẳng mép, cách đều) KHÔNG bị gộp thành một đoạn văn', async () => {
    const src = await textPdf((t) => {
      t('Gia', 40, 100, 14); t('Ten', 200, 100, 14)
      t('5000', 40, 120, 14); t('But', 200, 120, 14)
      t('12000', 40, 140, 14); t('Vo', 200, 140, 14)
    })
    const texts = (await segmentsOf(src)).map((b) => b.text)
    expect(texts).toEqual(expect.arrayContaining(['5000', '12000', 'But', 'Vo']))
    expect(texts.some((x) => x.includes('5000') && x.includes('12000'))).toBe(false)
  })

  it('khối không lẫn chữ cột bên phải cùng hàng khi sửa (chữ ở cột kia không bị xóa)', async () => {
    const src = await textPdf((t) => {
      t('Left paragraph first line text', 40, 100, 14)
      t('Left paragraph second line text', 40, 118, 14)
      t('RIGHT COLUMN', 300, 100, 14)
    })
    const blocks = await segmentsOf(src)
    const left = blocks.find((b) => b.text.startsWith('Left'))!
    expect(left.lines).toBe(2)
    const { bytes } = await applyD(src, [edit(left, 'Replaced left')])
    const all = (await pageTexts(bytes))[0]!.map((i) => i.str).join(' ')
    expect(all).toContain('RIGHT COLUMN')
    expect(all).toContain('Replaced left')
    expect(all).not.toContain('Left paragraph')
  })
})

// ---- Giữ phông và màu của chữ gốc ----
import { extractTextStyles, styleForParts, toHex, classifyFont } from './pdfFontStyle'

/** Như trình chỉnh: đọc phông/màu gốc của khối rồi sửa với đúng phông/màu đó. */
async function editLikeUi(src: Uint8Array, text: string, blockIndex = 0) {
  const blocks = await segmentsOf(src)
  const seg = blocks[blockIndex]!
  const styles = await extractTextStyles(src)
  const st = styleForParts(styles[0]!, seg.parts, seg.angle)
  const ann = edit(seg, text, { family: st.font?.family ?? 'sans', bold: st.font?.bold ?? false, italic: st.font?.italic ?? false, color: st.fill ? toHex(st.fill) : '#000000' })
  return { ...(await applyD(src, [ann])), style: st, ann }
}
/** Bề rộng cả dòng chữ (từ mép trái đến mép phải của các đoạn pdf.js trả về cùng đường cơ sở với đoạn chứa `needle`). */
const widthOf = async (bytes: Uint8Array, needle: string) => {
  const items = (await pageTexts(bytes))[0]!
  const first = items.find((i) => i.str.includes(needle))!
  const line = items.filter((i) => Math.abs(i.y - first.y) < 1)
  return Math.max(...line.map((i) => i.x + i.width)) - Math.min(...line.map((i) => i.x))
}
const refWidth = async (std: StandardFonts, text: string, size: number) => {
  const d = await PDFDocument.create()
  return (await d.embedFont(std)).widthOfTextAtSize(text, size)
}
async function stdPdf(std: StandardFonts, text: string, color = rgb(0, 0, 0), size = 24) {
  const d = await PDFDocument.create()
  const f = await d.embedFont(std)
  d.addPage([400, 300]).drawText(text, { x: 40, y: 200, size, font: f, color })
  return d.save()
}

describe('chữ mới giữ phông và màu của chữ gốc', () => {
  const cases: [string, StandardFonts, 'sans' | 'serif' | 'mono', boolean, boolean][] = [
    ['Helvetica', StandardFonts.Helvetica, 'sans', false, false],
    ['Helvetica-Bold', StandardFonts.HelveticaBold, 'sans', true, false],
    ['Helvetica-Oblique', StandardFonts.HelveticaOblique, 'sans', false, true],
    ['Times-Roman', StandardFonts.TimesRoman, 'serif', false, false],
    ['Times-Bold', StandardFonts.TimesRomanBold, 'serif', true, false],
    ['Times-Italic', StandardFonts.TimesRomanItalic, 'serif', false, true],
    ['Courier', StandardFonts.Courier, 'mono', false, false],
    ['Courier-Bold', StandardFonts.CourierBold, 'mono', true, false],
  ]
  for (const [name, std, family, bold, italic] of cases) {
    it(`${name}: nhận đúng họ phông (${family}${bold ? ', đậm' : ''}${italic ? ', nghiêng' : ''}) và chữ mới có CÙNG bề rộng như viết bằng phông gốc`, async () => {
      const src = await stdPdf(std, 'Hello World')
      const next = 'Quick brown fox 123'
      const { bytes, style, warnings } = await editLikeUi(src, next)
      expect(warnings).toEqual([])
      expect(style.font).toMatchObject({ family, bold, italic })
      // Bề rộng thật của chữ mới trong tệp xuất so với bề rộng phông gốc cho cùng chuỗi: tương đương số đo (Liberation Sans/Serif/Mono
      // tương thích số đo Arial/Times New Roman/Courier New, lệch Helvetica/Times của Adobe chỉ vài phần trăm).
      const got = await widthOf(bytes, 'Quick')
      const want = await refWidth(std, next, 24)
      expect(Math.abs(got - want) / want, `${name}: ${got} so với ${want}`).toBeLessThan(0.015)
    })
  }

  it('so với phông cũ (DejaVu) thì chữ rộng hơn hẳn: chứng tỏ không còn dùng DejaVu', async () => {
    const src = await stdPdf(StandardFonts.Helvetica, 'Hello World')
    const blocks = await segmentsOf(src)
    const auto = await applyD(src, [edit(blocks[0]!, 'Quick brown fox 123', { family: 'sans' })])
    const dejavu = await applyD(src, [edit(blocks[0]!, 'Quick brown fox 123', { family: 'dejavu' })])
    expect(await widthOf(dejavu.bytes, 'Quick')).toBeGreaterThan((await widthOf(auto.bytes, 'Quick')) * 1.1)
  })

  it('màu chữ gốc được giữ: chữ đỏ sửa xong vẫn đỏ (đọc từ nội dung, kiểm tra bằng điểm ảnh)', async () => {
    const src = await stdPdf(StandardFonts.HelveticaBold, 'Red text', rgb(0.8, 0.1, 0.1), 40)
    const { bytes, style, ann } = await editLikeUi(src, 'Still red')
    expect(style.fill).toEqual([0.8, 0.1, 0.1])
    expect(ann.color).toBe('#cc1a1a')
    const b = await render(bytes)
    let reddish = 0
    let black = 0
    for (let y = Math.floor(ann.baseline - 35); y < ann.baseline + 5; y++) {
      for (let x = Math.floor(ann.x); x < ann.x + 200; x++) {
        const [r, g, bl] = px(b, x, y)
        if (r! > 150 && g! < 100 && bl! < 100) reddish++
        if (r! < 60 && g! < 60 && bl! < 60) black++
      }
    }
    expect(reddish).toBeGreaterThan(150)
    expect(black).toBe(0)
  })

  it('vị trí và cỡ chữ vẫn đúng như chữ gốc (cùng mép trái, cùng đường cơ sở, cùng cỡ)', async () => {
    const src = await stdPdf(StandardFonts.TimesRoman, 'Original', rgb(0, 0, 0), 30)
    const { bytes } = await editLikeUi(src, 'Replaced')
    const it0 = (await pageTexts(bytes))[0]![0]!
    expect(it0.x).toBeCloseTo(40, 0)
    expect(it0.y).toBeCloseTo(200, 0)
    expect(it0.size).toBeCloseTo(30, 0)
  })

  it('đổi họ phông, đậm, nghiêng thủ công thì chữ mới đổi theo', async () => {
    const src = await stdPdf(StandardFonts.Helvetica, 'Hello World')
    const [seg] = await segmentsOf(src)
    const reg = await widthOf((await applyD(src, [edit(seg!, 'Quick brown fox', { family: 'sans' })])).bytes, 'Quick')
    const bold = await widthOf((await applyD(src, [edit(seg!, 'Quick brown fox', { family: 'sans', bold: true })])).bytes, 'Quick')
    const mono = await widthOf((await applyD(src, [edit(seg!, 'Quick brown fox', { family: 'mono' })])).bytes, 'Quick')
    expect(bold).toBeGreaterThan(reg)
    expect(Math.abs(mono - 'Quick brown fox'.length * 0.6 * 24)).toBeLessThan(0.6) // Courier: mọi ký tự rộng 0,6 em
  })

  it('PDF không có thông tin phông (nội dung dạng lạ): vẫn sửa được với phông mặc định sans và màu đen', async () => {
    const styles = await extractTextStyles(await stdPdf(StandardFonts.Helvetica, 'x'))
    expect(styles[0]![0]!.font?.family).toBe('sans')
    expect(styleForParts([], [{ x: 0, baseline: 0, w: 10 }], 0)).toEqual({ font: null, fill: null })
  })
})

describe('mọi biến thể phông đều VẼ ra được chữ (chống lỗi chữ vô hình do cắt phông con)', () => {
  // Bài học: Arimo/Tinos/Cousine bị fontkit cắt phông con làm hỏng (chữ vô hình) nhưng vẫn "có chữ" khi trích xuất, nên phải đo điểm ảnh.
  const combos = (['sans', 'serif', 'mono', 'dejavu'] as const).flatMap((family) =>
    ([[false, false], [true, false], [false, true], [true, true]] as const).map(([bold, italic]) => [family, bold, italic] as const),
  )
  for (const [family, bold, italic] of combos) {
    it(`${family}${bold ? ' đậm' : ''}${italic ? ' nghiêng' : ''}: chữ tiếng Việt hiện ra thật (có điểm tối trong khung chữ)`, async () => {
      const src = await textPdf((t) => t('Original line', 40, 60, 28))
      const [seg] = await segmentsOf(src)
      const { bytes, warnings } = await applyD(src, [edit(seg!, 'Tiếng Việt: ệ ẫ ơ ư đ', { family, bold, italic })])
      expect(warnings).toEqual([])
      const b = await render(bytes)
      let dark = 0
      for (let y = Math.floor(seg!.baseline - seg!.size); y < seg!.baseline + seg!.size * 0.35; y++) for (let x = Math.floor(seg!.x); x < seg!.x + 300; x++) if (px(b, x, y)[0]! < 120) dark++
      expect(dark).toBeGreaterThan(150)
    })
  }
})

describe('classifyFont', () => {
  it.each([
    ['ArialMT', 'sans', false, false],
    ['ABCDEF+Arial-BoldMT', 'sans', true, false],
    ['Helvetica-Oblique', 'sans', false, true],
    ['TimesNewRomanPS-BoldItalicMT', 'serif', true, true],
    ['XYZABC+LiberationSerif-Italic', 'serif', false, true],
    ['Courier-Bold', 'mono', true, false],
    ['Consolas', 'mono', false, false],
    ['Calibri-Light', 'sans', false, false],
    ['Cambria', 'serif', false, false],
    ['NotoSansCJK-Regular', 'sans', false, false],
    ['NotoSerif-Bold', 'serif', true, false],
    ['DejaVuSansMono', 'mono', false, false],
    ['SansSerifFont', 'sans', false, false], // chứa "serif" nhưng là sans-serif
    ['Roboto-Black', 'sans', true, false],
  ] as const)('%s → %s bold=%s italic=%s', (name, family, bold, italic) => {
    expect(classifyFont(name)).toMatchObject({ family, bold, italic })
  })
  it('tên lạ: dùng cờ FontDescriptor (Serif = 2, FixedPitch = 1, Italic = 64, ForceBold = 262144) và FontWeight', () => {
    expect(classifyFont('MyFont', 2).family).toBe('serif')
    expect(classifyFont('MyFont', 1).family).toBe('mono')
    expect(classifyFont('MyFont', 0).family).toBe('sans')
    expect(classifyFont('MyFont', 64).italic).toBe(true)
    expect(classifyFont('MyFont', 262144).bold).toBe(true)
    expect(classifyFont('MyFont', 0, 700).bold).toBe(true)
    expect(classifyFont('MyFont', 0, 400).bold).toBe(false)
  })
})

describe('sửa chữ: căn lề trái/giữa/phải trong khối', () => {
  it('căn giữa giữ tâm khối, căn phải giữ mép phải khối, căn trái giữ mép trái', async () => {
    const src = await textPdf((t) => t('A very long original line of text', 40, 60, 20))
    const [seg] = await segmentsOf(src)
    const left = seg!.x
    const right = seg!.x + seg!.w
    const run = async (align: 'left' | 'center' | 'right') => {
      const { bytes } = await applyD(src, [edit(seg!, 'Short', { align })])
      const it = (await pageTexts(bytes))[0]!.find((i) => i.str.includes('Short'))!
      return { x: it.x, end: it.x + it.width }
    }
    const l = await run('left')
    const c = await run('center')
    const r = await run('right')
    expect(l.x).toBeCloseTo(left, 0)
    expect((c.x + c.end) / 2).toBeCloseTo((left + right) / 2, 0)
    expect(r.end).toBeCloseTo(right, 0)
    expect(c.x).toBeGreaterThan(l.x + 20)
  })

  it('đoạn nhiều dòng: mỗi dòng được căn riêng trong bề rộng khối', async () => {
    const src = await textPdf((t) => { t('First line of the paragraph here', 40, 60, 14); t('second line of the paragraph here', 40, 78, 14) })
    const [seg] = await segmentsOf(src)
    expect(seg!.lines).toBe(2)
    const { bytes } = await applyD(src, [edit(seg!, 'Hi\nLonger second', { align: 'right' })])
    const items = (await pageTexts(bytes))[0]!
    const a = items.find((i) => i.str.includes('Hi'))!
    const b = items.find((i) => i.str.includes('Longer'))!
    expect(a.x + a.width).toBeCloseTo(seg!.x + seg!.w, 0)
    expect(b.x + b.width).toBeCloseTo(seg!.x + seg!.w, 0)
    expect(a.x).toBeGreaterThan(b.x)
  })
})
