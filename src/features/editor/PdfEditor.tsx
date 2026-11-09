import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlignCenter, AlignLeft, AlignRight, ArrowUpRight, CalendarDays, CheckSquare, Circle, Eraser, Highlighter, ImagePlus, Minus, MousePointer2,
  EyeOff, Pencil, PenLine, Redo2, TextCursorInput, Square, Trash2, Type, Undo2, Signature,
} from 'lucide-react'
import dejavuUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url'
import { createPdfRenderer, type PdfRenderer } from '@/lib/pdfRender'
import { extractPdfText } from '@/lib/pdfText'
import { ASCENT, buildBlocks, segmentCorners, type Block } from '@/lib/textSegments'
import { wrapParagraphs } from '@/lib/wrapText'
import { caretIndex } from '@/lib/caret'
import { alignOffset, type TextAlign } from '@/lib/wrapText'
import { EDIT_FAMILIES, type Annotation, type EditFamily } from '@/lib/annotations'
import { extractTextStyles, styleForParts, toHex, type OpStyle } from '@/lib/pdfFontStyle'
import { familyFontUrl, faceStyle, type FamilyKey } from '@/lib/fonts'
import { ToolError } from '@/tools/types'
import { Modal } from '@/components/Modal'
import { useObjectUrl } from '../tools/ImageEditors'
import { SignatureDialog, type Asset } from './SignatureDialog'

export type EditorMode = 'annotate' | 'edit' | 'sign' | 'redact'
type Tool = 'select' | 'pen' | 'highlight' | 'text' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'whiteout' | 'image' | 'checkbox' | 'signature' | 'initials' | 'date' | 'redact' | 'editText'

const PALETTE: Record<EditorMode, Tool[]> = {
  annotate: ['select', 'pen', 'highlight', 'text', 'rect', 'ellipse', 'line', 'arrow'],
  edit: ['select', 'editText', 'text', 'image', 'whiteout', 'rect', 'ellipse', 'checkbox'],
  sign: ['select', 'signature', 'initials', 'date', 'text', 'checkbox'],
  redact: ['select', 'redact'],
}
const ICONS: Record<Tool, typeof Pencil> = {
  select: MousePointer2, pen: Pencil, highlight: Highlighter, text: Type, rect: Square, ellipse: Circle, line: Minus,
  arrow: ArrowUpRight, whiteout: Eraser, image: ImagePlus, checkbox: CheckSquare, signature: Signature, initials: PenLine, date: CalendarDays, redact: EyeOff, editText: TextCursorInput,
}
const DRAG_TOOLS: Tool[] = ['highlight', 'rect', 'ellipse', 'line', 'arrow', 'whiteout', 'redact']

type Pt = { x: number; y: number }
const uid = () => crypto.randomUUID()
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** Đoạn chữ mở ra để xem nhưng chưa đổi nội dung thì không phải thay đổi: không đưa vào kết quả xuất. */
const changed = (a: Annotation) => a.type !== 'textEdit' || a.text !== a.original
const exportable = (list: Annotation[]) => list.filter(changed)

// Phông chữ cho phần xem trước giống phông dùng khi xuất (DejaVu Sans), để chữ khớp kích thước.
/** Tên họ phông dùng trong CSS cho phần xem trước (khớp tệp TTF sẽ được nhúng khi xuất). */
const PREVIEW_FAMILY: Record<FamilyKey, string> = { sans: 'Liberation Sans', serif: 'Liberation Serif', mono: 'Liberation Mono' }
const cssFamily = (f: EditFamily) => (f === 'dejavu' ? '"DejaVu Sans", sans-serif' : `"${PREVIEW_FAMILY[f]}", ${f === 'serif' ? 'serif' : f === 'mono' ? 'monospace' : 'sans-serif'}`)

let fontInjected = false
function ensureFont() {
  if (fontInjected) return
  fontInjected = true
  const style = document.createElement('style')
  const faces = (['sans', 'serif', 'mono'] as FamilyKey[]).flatMap((fam) =>
    ([[false, false], [true, false], [false, true], [true, true]] as const).map(
      ([b, i]) => `@font-face{font-family:"${PREVIEW_FAMILY[fam]}";font-weight:${b ? 700 : 400};font-style:${i ? 'italic' : 'normal'};src:url(${familyFontUrl(fam, faceStyle(b, i))}) format("truetype");font-display:swap}`,
    ),
  )
  style.textContent = `@font-face{font-family:"DejaVu Sans";src:url(${dejavuUrl}) format("truetype");font-display:swap}${faces.join('')}`
  document.head.append(style)
}

let measureCtx: CanvasRenderingContext2D | null = null
/** Hàm đo bề rộng chữ bằng canvas cho phần xem trước (cùng thuật toán ngắt dòng với khi xuất). */
function measurer(font: string): (s: string) => number {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  return (s) => {
    if (!measureCtx) return s.length * 8
    measureCtx.font = font
    return measureCtx.measureText(s).width
  }
}

/** Độ cao phần trên/dưới đường cơ sở của phông (theo đơn vị của cỡ chữ), để đặt ô sửa khớp đường cơ sở của chữ trên trang. */
function fontMetrics(face: string): { ascent: number; descent: number } {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return { ascent: ASCENT, descent: 0.25 }
  measureCtx.font = face
  const m = measureCtx.measureText('Hg')
  return { ascent: m.fontBoundingBoxAscent ?? ASCENT * parseFloat(face.match(/([\d.]+)px/)?.[1] ?? '12'), descent: m.fontBoundingBoxDescent ?? 3 }
}

/**
 * Ô sửa chữ ngay trên trang: đặt đúng vị trí, hướng, phông, cỡ, màu của khối chữ nên nhìn như sửa trực tiếp trên văn bản.
 * Kích thước tính bằng cqw (1% bề rộng trang trên màn hình) nên co giãn theo khung xem; con trỏ đặt đúng chỗ vừa bấm.
 */
function InlineTextEditor({ a, page, takeCaret, onChange, onClose }: { a: Extract<Annotation, { type: 'textEdit' }>; page: { width: number; height: number }; takeCaret: (id: string) => Pt | null; onChange: (text: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLTextAreaElement>(null)
  const family = cssFamily(a.family)
  const face = `${a.italic ? 'italic ' : ''}${a.bold ? 'bold ' : ''}${a.size}px ${family}`
  const { ascent, descent } = fontMetrics(face)
  const multi = a.lines > 1
  const cq = (pt: number) => `${(pt / page.width) * 100}cqw`
  // Đường cơ sở đầu tiên nằm cách mép trên của ô một đoạn: nửa phần dư của dòng + phần trên đường cơ sở của phông.
  const toBaseline = (a.lineHeight - (ascent + descent)) / 2 + ascent

  // Vừa khít nội dung: cao theo số dòng, và với khối một dòng thì rộng theo chữ (không bao giờ hẹp hơn khung gốc).
  const fit = useCallback(() => {
    const el = ref.current
    const host = el?.closest<HTMLElement>('[data-page-host]')
    if (!el || !host) return
    el.style.height = 'auto'
    if (!multi) el.style.width = '0'
    if (!multi) el.style.width = `${Math.max(el.scrollWidth + 2, (a.w / page.width) * host.clientWidth)}px`
    el.style.height = `${el.scrollHeight}px`
    // Khối một dòng rộng hơn khung gốc: căn giữa/phải thì giữ tâm/mép phải của khung gốc cố định.
    const extra = el.offsetWidth - (a.w / page.width) * host.clientWidth
    el.style.left = `${multi || extra <= 0 ? 0 : a.align === 'center' ? -extra / 2 : a.align === 'right' ? -extra : 0}px`
  }, [multi, a.w, a.align, page.width])
  useLayoutEffect(fit, [fit, a.text, a.size, a.family, a.bold, a.italic, a.align])
  useEffect(() => {
    const host = ref.current?.closest<HTMLElement>('[data-page-host]')
    if (!host) return
    const ro = new ResizeObserver(fit)
    ro.observe(host)
    document.fonts?.addEventListener('loadingdone', fit)
    return () => {
      ro.disconnect()
      document.fonts?.removeEventListener('loadingdone', fit)
    }
  }, [fit])

  // Khi mở: lấy focus và đặt con trỏ đúng chỗ bấm (không có điểm bấm, ví dụ mở bằng bàn phím: ở cuối).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    const point = takeCaret(a.id)
    let idx = el.value.length
    if (point) idx = caretIndex(el.value, measurer(face), { x: a.x, baseline: a.baseline, angle: a.angle, lineHeight: a.lineHeight, wrapWidth: multi ? a.w : 0, align: a.align, blockWidth: a.w }, point)
    el.setSelectionRange(idx, idx)
    // chỉ chạy một lần khi ô được tạo (key theo id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      style={{ position: 'absolute', left: `${(a.x / page.width) * 100}%`, top: `${(a.baseline / page.height) * 100}%`, transformOrigin: '0 0', transform: a.angle ? `rotate(${-a.angle}deg)` : undefined, zIndex: 5 }}
    >
      <textarea
        ref={ref}
        aria-label={t('editor.content')}
        spellCheck={false}
        rows={1}
        wrap={multi ? 'soft' : 'off'}
        value={a.text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        style={{
          position: 'absolute',
          top: `calc(-1 * ${cq(toBaseline)})`,
          margin: 0,
          padding: 0,
          border: 0,
          resize: 'none',
          overflow: 'hidden',
          background: '#fff',
          color: a.color,
          fontFamily: family,
          fontWeight: a.bold ? 700 : 400,
          fontStyle: a.italic ? 'italic' : 'normal',
          fontSize: cq(a.size),
          lineHeight: cq(a.lineHeight),
          textAlign: a.align ?? 'left',
          whiteSpace: multi ? 'pre-wrap' : 'pre',
          width: multi ? cq(a.w) : undefined,
          boxShadow: '0 0 0 1.5px var(--action)',
          outline: 'none',
        }}
      />
    </div>
  )
}

function bbox(a: Annotation): { x: number; y: number; w: number; h: number } {
  switch (a.type) {
    case 'ink': {
      const xs = a.points.map((p) => p[0]), ys = a.points.map((p) => p[1])
      const x = Math.min(...xs), y = Math.min(...ys)
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
    }
    case 'line': case 'arrow': {
      const x = Math.min(a.x1, a.x2), y = Math.min(a.y1, a.y2)
      return { x, y, w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) }
    }
    case 'text': {
      const lines = a.text.split('\n')
      return { x: a.x, y: a.y, w: Math.max(1, ...lines.map((l) => l.length)) * a.size * 0.6, h: lines.length * a.size * 1.2 }
    }
    case 'checkbox': return { x: a.x, y: a.y, w: a.size, h: a.size }
    case 'textEdit': {
      const c = segmentCorners(a)
      const xs = c.map((p) => p[0]), ys = c.map((p) => p[1])
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    }
    default: return { x: a.x, y: a.y, w: a.w, h: a.h }
  }
}

function move(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case 'ink': return { ...a, points: a.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) }
    case 'line': case 'arrow': return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy }
    case 'textEdit': return a // sửa tại chỗ: không kéo đi nơi khác (chữ gốc nằm ở vị trí cố định)
    default: return { ...a, x: a.x + dx, y: a.y + dy } as Annotation
  }
}

function resizeBox(a: Annotation, dx: number, dy: number): Annotation {
  if (a.type === 'highlight' || a.type === 'whiteout' || a.type === 'redact' || a.type === 'rect' || a.type === 'ellipse') return { ...a, w: Math.max(4, a.w + dx), h: Math.max(4, a.h + dy) }
  if (a.type === 'image') {
    const w = Math.max(10, a.w + dx)
    return { ...a, w, h: (a.h / a.w) * w } // ảnh giữ tỉ lệ
  }
  if (a.type === 'checkbox') return { ...a, size: Math.max(8, a.size + Math.max(dx, dy)) }
  if (a.type === 'text') return { ...a, size: clamp(a.size + dy * 0.5, 6, 120) }
  return a
}

export default function PdfEditor({ bytes, mode, onChange, onApply, busy = false }: { bytes: Uint8Array; mode: EditorMode; onChange: (a: Annotation[]) => void; onApply?: (a: Annotation[]) => Promise<void>; busy?: boolean }) {
  const { t, i18n } = useTranslation()
  const palette = PALETTE[mode]
  const [renderer, setRenderer] = useState<PdfRenderer | null>(null)
  const [sizes, setSizes] = useState<{ width: number; height: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [anns, setAnns] = useState<Annotation[]>([])
  // Lịch sử nằm trong ref (nguồn sự thật duy nhất); state chỉ để vẽ lại trạng thái nút. Không gọi setState lồng
  // trong hàm cập nhật, vì StrictMode chạy hàm đó hai lần.
  const history = useRef<{ past: Annotation[][]; future: Annotation[][] }>({ past: [], future: [] })
  const [counts, setCounts] = useState({ past: 0, future: 0 })
  const syncCounts = () => setCounts({ past: history.current.past.length, future: history.current.future.length })
  const [tool, setTool] = useState<Tool>(palette[1] ?? 'select')
  const [color, setColor] = useState('#d32f2f')
  const [width, setWidth] = useState(3)
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [signature, setSignature] = useState<Asset | null>(null)
  // Đoạn chữ sửa được của từng trang: chỉ đọc khi người dùng mở công cụ "Sửa chữ có sẵn" lần đầu.
  const [segments, setSegments] = useState<Block[][] | null>(null)
  const [segError, setSegError] = useState(false)
  const [styles, setStyles] = useState<OpStyle[][] | null>(null)
  const [, setFontTick] = useState(0) // vẽ lại khi phông xem trước tải xong (đo chữ phụ thuộc phông đã nạp)
  /** Điểm bấm gần nhất vào một khối chữ, để đặt con trỏ đúng chỗ khi mở ô sửa tại chỗ. */
  const caretHint = useRef<{ id: string; point: Pt } | null>(null)
  const [image, setImage] = useState<Asset | null>(null)
  const [initials, setInitials] = useState('')
  const [dialog, setDialog] = useState<'signature' | 'initials' | null>(null)
  const [lastPage, setLastPage] = useState(0)
  const imageInput = useRef<HTMLInputElement>(null)
  const drag = useRef<{ id: string; kind: 'move' | 'resize' | 'p1' | 'p2'; start: Pt; orig: Annotation; moved: boolean } | null>(null)
  const draw = useRef<{ page: number; start: Pt } | null>(null)
  const latest = useRef(anns)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    latest.current = anns
    onChangeRef.current = onChange
  })

  useEffect(ensureFont, [])
  useEffect(() => {
    const bump = () => setFontTick((n) => n + 1)
    document.fonts?.addEventListener('loadingdone', bump)
    return () => document.fonts?.removeEventListener('loadingdone', bump)
  }, [])

  // Tự dọn và khởi động lại đúng cách (StrictMode chạy effect → dọn → chạy lại): yêu cầu bị hủy sẽ được tạo mới.
  useEffect(() => {
    if (tool !== 'editText' || segments || segError) return
    const ac = new AbortController()
    Promise.all([extractPdfText(bytes, ac.signal), extractTextStyles(bytes).catch(() => [] as OpStyle[][])])
      .then(([pages, st]) => {
        setStyles(st)
        setSegments(pages.map(buildBlocks))
      })
      .catch(() => !ac.signal.aborted && setSegError(true))
    return () => ac.abort()
  }, [tool, segments, segError, bytes])

  useEffect(() => {
    let alive = true
    let made: PdfRenderer | null = null
    createPdfRenderer(bytes)
      .then(async (r) => {
        if (!alive) return r.destroy()
        made = r
        const s = await Promise.all(Array.from({ length: r.pageCount }, (_, i) => r.pageSize(i)))
        if (!alive) return
        setRenderer(r)
        setSizes(s)
      })
      .catch((e) => alive && setError(t(`errors.${e instanceof ToolError ? e.code : 'unknown'}`)))
    return () => {
      alive = false
      made?.destroy()
    }
  }, [bytes, t])

  const apply = useCallback((next: Annotation[], record = true) => {
    if (record) {
      history.current.past.push(latest.current)
      history.current.future = []
      syncCounts()
    }
    latest.current = next
    setAnns(next)
    onChangeRef.current(exportable(next))
  }, [])

  const undo = useCallback(() => {
    const prev = history.current.past.pop()
    if (!prev) return
    history.current.future.unshift(latest.current)
    latest.current = prev
    setAnns(prev)
    onChangeRef.current(exportable(prev))
    syncCounts()
  }, [])
  const redo = useCallback(() => {
    const nxt = history.current.future.shift()
    if (!nxt) return
    history.current.past.push(latest.current)
    latest.current = nxt
    setAnns(nxt)
    onChangeRef.current(exportable(nxt))
    syncCounts()
  }, [])
  const remove = useCallback(() => {
    if (selected) {
      apply(latest.current.filter((a) => a.id !== selected))
      setSelected(null)
    }
  }, [selected, apply])

  /** Bỏ hết thay đổi đang chờ; vẫn hoàn tác được (Ctrl+Z) nên không cần hộp xác nhận. */
  const discard = useCallback(() => {
    apply([])
    setSelected(null)
  }, [apply])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, dialog')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if (e.key === 'Delete' || e.key === 'Backspace') remove()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, remove])

  const place = useCallback((page: number, at: Pt, t0: Tool, extra?: { signature?: Asset; image?: Asset }) => {
    const sz = sizes[page]
    if (!sz) return
    const add = (a: Annotation) => { apply([...latest.current, a]); setSelected(a.id) }
    const base = { id: uid(), page }
    if (t0 === 'text') add({ ...base, type: 'text', x: at.x, y: at.y, text: t('editor.defaultText'), size: 18, color })
    else if (t0 === 'date') add({ ...base, type: 'text', x: at.x, y: at.y, text: new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date()), size: 16, color })
    else if (t0 === 'checkbox') add({ ...base, type: 'checkbox', x: at.x, y: at.y, size: 18, checked: true, color })
    else if (t0 === 'initials') add({ ...base, type: 'text', x: at.x, y: at.y, text: initials, size: 22, color })
    else if (t0 === 'signature' || t0 === 'image') {
      const asset = t0 === 'signature' ? (extra?.signature ?? signature) : (extra?.image ?? image)
      if (!asset) return
      const w = Math.min(t0 === 'signature' ? 160 : sz.width * 0.4, sz.width - 8)
      const h = (asset.h / asset.w) * w
      add({ ...base, type: 'image', x: clamp(at.x - w / 2, 0, sz.width - w), y: clamp(at.y - h / 2, 0, sz.height - h), w, h, data: asset.data })
    }
  }, [sizes, apply, t, i18n.language, color, initials, signature, image])

  const choose = (next: Tool) => {
    setTool(next)
    setSelected(null)
    if (next === 'signature' && !signature) setDialog('signature')
    if (next === 'initials' && !initials) setDialog('initials')
    if (next === 'image' && !image) imageInput.current?.click()
  }

  /** Bấm vào một đoạn chữ: mở lại thành phần đã có cho đoạn đó, hoặc tạo mới với chữ gốc để sửa. */
  const pickSegment = (page: number, seg: Block, point?: Pt) => {
    const same = (a: Annotation) =>
      a.type === 'textEdit' && a.page === page && a.parts[0]!.x === seg.parts[0]!.x && a.parts[0]!.baseline === seg.parts[0]!.baseline
    const existing = latest.current.find(same)
    if (existing) {
      caretHint.current = point ? { id: existing.id, point } : null
      return setSelected(existing.id)
    }
    const style = styleForParts(styles?.[page] ?? [], seg.parts, seg.angle)
    const a: Annotation = {
      id: uid(), page, type: 'textEdit', x: seg.x, baseline: seg.baseline, angle: seg.angle, w: seg.w, h: seg.h, lines: seg.lines, lineHeight: seg.lineHeight,
      original: seg.text, text: seg.text, size: Math.round(seg.size * 10) / 10, parts: seg.parts,
      // Phông và màu của chữ gốc (đọc từ nội dung trang); không đọc được thì sans, đen.
      family: style.font?.family ?? 'sans', bold: false, italic: false, // không tự áp đậm/nghiêng của chữ gốc: tránh cả đoạn bị đậm/nghiêng ngoài ý muốn
      color: style.fill ? toHex(style.fill) : '#000000', sourceFont: style.font?.name,
    }
    caretHint.current = point ? { id: a.id, point } : null
    apply([...latest.current, a])
    setSelected(a.id)
  }

  const toPoint = (e: React.PointerEvent, el: Element, size: { width: number; height: number }): Pt => {
    const r = el.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * size.width, y: ((e.clientY - r.top) / r.height) * size.height }
  }

  const onSurfaceDown = (page: number, e: React.PointerEvent<SVGSVGElement>) => {
    const size = sizes[page]!
    const p = toPoint(e, e.currentTarget, size)
    setLastPage(page)
    if (tool === 'select' || tool === 'editText') return setSelected(null)
    if (tool === 'pen') {
      e.currentTarget.setPointerCapture(e.pointerId)
      draw.current = { page, start: p }
      setDraft({ id: uid(), page, type: 'ink', points: [[p.x, p.y]], color, width })
    } else if (DRAG_TOOLS.includes(tool)) {
      e.currentTarget.setPointerCapture(e.pointerId)
      draw.current = { page, start: p }
      const id = uid()
      if (tool === 'line' || tool === 'arrow') setDraft({ id, page, type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width })
      else if (tool === 'highlight') setDraft({ id, page, type: 'highlight', x: p.x, y: p.y, w: 0, h: 0, color: '#ffeb3b' })
      else if (tool === 'whiteout' || tool === 'redact') setDraft({ id, page, type: tool, x: p.x, y: p.y, w: 0, h: 0 })
      else setDraft({ id, page, type: tool as 'rect' | 'ellipse', x: p.x, y: p.y, w: 0, h: 0, color, width, fill: false })
    } else place(page, p, tool)
  }

  const onSurfaceMove = (page: number, e: React.PointerEvent<SVGSVGElement>) => {
    const size = sizes[page]!
    const p = toPoint(e, e.currentTarget, size)
    const d = drag.current
    if (d && d.id) {
      const dx = p.x - d.start.x, dy = p.y - d.start.y
      if (!d.moved && Math.hypot(dx, dy) < 1) return
      if (!d.moved) { d.moved = true; history.current.past.push(latest.current); history.current.future = []; syncCounts() }
      let next: Annotation
      if (d.kind === 'move') next = move(d.orig, dx, dy)
      else if (d.kind === 'resize') next = resizeBox(d.orig, dx, dy)
      else if (d.orig.type === 'line' || d.orig.type === 'arrow') next = d.kind === 'p1' ? { ...d.orig, x1: d.orig.x1 + dx, y1: d.orig.y1 + dy } : { ...d.orig, x2: d.orig.x2 + dx, y2: d.orig.y2 + dy }
      else next = d.orig
      apply(latest.current.map((a) => (a.id === d.id ? next : a)), false)
      return
    }
    const dr = draw.current
    if (!dr || dr.page !== page || !draft) return
    const q = { x: clamp(p.x, 0, size.width), y: clamp(p.y, 0, size.height) }
    if (draft.type === 'ink') {
      const last = draft.points[draft.points.length - 1]!
      if (Math.hypot(q.x - last[0], q.y - last[1]) > 1.5) setDraft({ ...draft, points: [...draft.points, [q.x, q.y]] })
    } else if (draft.type === 'line' || draft.type === 'arrow') setDraft({ ...draft, x2: q.x, y2: q.y })
    else if ('w' in draft && 'y' in draft) setDraft({ ...draft, x: Math.min(dr.start.x, q.x), y: Math.min(dr.start.y, q.y), w: Math.abs(q.x - dr.start.x), h: Math.abs(q.y - dr.start.y) })
  }

  const onSurfaceUp = () => {
    if (drag.current) { drag.current = null; return }
    const d = draft
    draw.current = null
    setDraft(null)
    if (!d) return
    const tiny = d.type === 'ink' ? false : 'w' in d ? d.w < 3 && d.h < 3 : d.type === 'line' || d.type === 'arrow' ? Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 3 : false
    if (tiny) return
    apply([...latest.current, d])
    setSelected(d.id)
  }

  const startDrag = (a: Annotation, kind: 'move' | 'resize' | 'p1' | 'p2', e: React.PointerEvent, svg: SVGSVGElement) => {
    e.stopPropagation()
    svg.setPointerCapture(e.pointerId)
    setSelected(a.id)
    drag.current = { id: a.id, kind, start: toPoint(e, svg, sizes[a.page]!), orig: a, moved: false }
  }

  const current = anns.find((a) => a.id === selected) ?? null
  const patch = (p: Partial<Annotation>) => current && apply(anns.map((a) => (a.id === current.id ? ({ ...a, ...p } as Annotation) : a)))
  const hasColor = current && !['whiteout', 'redact', 'image', 'highlight'].includes(current.type)
  const hasWidth = current && ['ink', 'rect', 'ellipse', 'line', 'arrow'].includes(current.type)

  if (error) return <p role="alert" className="notice notice-error">{error}</p>
  if (!renderer) return <p className="text-muted">…</p>

  return (
    <div>
      <div role="toolbar" aria-label={t('editor.toolbar')} className="sticky top-14 z-[5] flex flex-wrap items-center gap-2 rounded-[var(--r-md)] border border-line bg-surface p-2">
        {palette.map((k) => {
          const Icon = ICONS[k]
          return (
            <button key={k} type="button" aria-pressed={tool === k} aria-label={t(`editor.tools.${k}`)} title={t(`editor.tools.${k}`)} className={`btn btn-icon ${tool === k ? 'btn-primary' : ''}`} onClick={() => choose(k)}>
              <Icon aria-hidden size={18} />
            </button>
          )
        })}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">{t('editor.color')}</span>
          <input type="color" aria-label={t('editor.color')} value={current && hasColor && 'color' in current ? current.color : color} onChange={(e) => (current && hasColor ? patch({ color: e.target.value } as Partial<Annotation>) : setColor(e.target.value))} className="size-9 cursor-pointer rounded border border-line bg-transparent p-0.5" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span>{t('editor.width')}</span>
          <select className="field-input" style={{ minHeight: 36, width: 'auto' }} value={current && hasWidth && 'width' in current ? current.width : width} onChange={(e) => (current && hasWidth ? patch({ width: Number(e.target.value) } as Partial<Annotation>) : setWidth(Number(e.target.value)))}>
            {[1, 2, 3, 5, 8].map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <button type="button" className="btn btn-icon" aria-label={t('editor.undo')} title={t('editor.undo')} disabled={!counts.past} onClick={undo}><Undo2 aria-hidden size={18} /></button>
        <button type="button" className="btn btn-icon" aria-label={t('editor.redo')} title={t('editor.redo')} disabled={!counts.future} onClick={redo}><Redo2 aria-hidden size={18} /></button>
        <button type="button" className="btn btn-icon" aria-label={t('editor.delete')} title={t('editor.delete')} disabled={!selected} onClick={remove}><Trash2 aria-hidden size={18} /></button>
        {onApply && (
          <>
            <span className="mx-1 h-6 w-px bg-line" aria-hidden />
            <button type="button" className="btn btn-primary" disabled={busy || anns.filter(changed).length === 0} onClick={() => void onApply(exportable(latest.current))}>
              {t('editor.applyChanges')}
            </button>
            <button type="button" className="btn" disabled={busy || anns.length === 0} onClick={discard}>
              {t('editor.discardChanges')}
            </button>
          </>
        )}
        {(tool === 'text' || tool === 'date' || tool === 'checkbox' || tool === 'initials' || tool === 'signature' || tool === 'image') && (
          <button type="button" className="btn ml-auto" onClick={() => place(lastPage, { x: sizes[lastPage]!.width / 2, y: sizes[lastPage]!.height / 2 }, tool)}>
            {t('editor.placeCenter')}
          </button>
        )}
        {tool === 'image' && <button type="button" className="btn" onClick={() => imageInput.current?.click()}>{t('editor.pickImage')}</button>}
        {tool === 'signature' && signature && <button type="button" className="btn" onClick={() => setDialog('signature')}>{t('editor.changeSignature')}</button>}
      </div>
      <input ref={imageInput} type="file" accept="image/png,image/jpeg" className="sr-only" tabIndex={-1} aria-hidden onChange={async (e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (!f) return
        const bmp = await createImageBitmap(f).catch(() => null)
        if (bmp) setImage({ data: new Uint8Array(await f.arrayBuffer()), w: bmp.width, h: bmp.height })
      }} />

      {tool === 'editText' && (
        <div className="mt-3 max-w-2xl" role="status">
          <p className="text-muted">{t('editor.hintEditText')}</p>
          {!segments && !segError && <p className="mt-1">{t('editor.loadingText')}</p>}
          {segError && <p className="notice notice-error mt-1" role="alert">{t('errors.unknown')}</p>}
          {segments && segments.every((p) => p.length === 0) && <p className="notice mt-2">{t('editor.noText')}</p>}
        </div>
      )}
      {current && (current.type === 'text' || current.type === 'rect' || current.type === 'ellipse' || current.type === 'checkbox') && (
        <div className="mt-3 grid max-w-xl gap-3 rounded-[var(--r-md)] border border-line bg-surface p-3">
          {current.type === 'text' && (
            <div>
              <label htmlFor="ann-text" className="field-label">{t('editor.content')}</label>
              <textarea id="ann-text" rows={2} className="field-input py-2" value={current.text} onChange={(e) => patch({ text: e.target.value })} />
              <label htmlFor="ann-size" className="field-label mt-2">{t('editor.fontSize')}</label>
              <input id="ann-size" type="number" min={6} max={120} className="field-input" value={Math.round(current.size)} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && patch({ size: clamp(e.target.valueAsNumber, 6, 120) })} />
            </div>
          )}
          {(current.type === 'rect' || current.type === 'ellipse') && (
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5 accent-[var(--action)]" checked={current.fill} onChange={(e) => patch({ fill: e.target.checked })} />{t('editor.fill')}</label>
          )}
          {current.type === 'checkbox' && (
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5 accent-[var(--action)]" checked={current.checked} onChange={(e) => patch({ checked: e.target.checked })} />{t('editor.checked')}</label>
          )}
        </div>
      )}


      <p className="mt-3 text-muted" role="status">{t('editor.count', { count: anns.filter(changed).length })}</p>

      <div className={`mt-3 grid items-start gap-4 ${tool === 'editText' ? 'lg:grid-cols-[minmax(0,1fr)_18rem]' : ''}`}>
      <div className="grid min-w-0 gap-6">
        {sizes.map((size, i) => (
          <PageSurface key={i} index={i} size={size} renderer={renderer} anns={anns.filter((a) => a.page === i)} draft={draft?.page === i ? draft : null}
            selected={selected} select={tool === 'select'} cursor={tool === 'select' ? 'default' : tool === 'editText' ? 'text' : 'crosshair'}
            segments={tool === 'editText' ? (segments?.[i] ?? []) : []} onPickSegment={(seg, pt) => pickSegment(i, seg, pt)}
            editing={current?.type === 'textEdit' && current.page === i ? current : null}
            takeCaret={(id) => {
              // không xóa: StrictMode chạy hiệu ứng hai lần; pickSegment luôn ghi đè điểm này ở mỗi lần chọn
              const h = caretHint.current
              return h && h.id === id ? h.point : null
            }}
            onEditText={(text) => patch({ text })} onCloseEdit={() => setSelected(null)}
            onDown={onSurfaceDown} onMove={onSurfaceMove} onUp={onSurfaceUp} startDrag={startDrag} />
        ))}
      </div>
        {current?.type === 'textEdit' && (
          <aside aria-label={t('editor.properties')} className="order-first grid gap-3 lg:sticky lg:top-32 lg:order-last">
      {current?.type === 'textEdit' && (
        <div className="grid gap-3 rounded-[var(--r-md)] border border-line bg-surface p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <div>
              <label htmlFor="ann-edit-font" className="field-label">{t('editor.family')}</label>
              <select id="ann-edit-font" className="field-input" value={current.family} onChange={(e) => patch({ family: e.target.value as EditFamily })}>
                {EDIT_FAMILIES.map((f) => <option key={f} value={f}>{t(`editor.families.${f}`)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ann-edit-size" className="field-label">{t('editor.fontSize')}</label>
              <input id="ann-edit-size" type="number" min={4} max={200} step={0.5} className="field-input" value={current.size} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && patch({ size: clamp(e.target.valueAsNumber, 4, 200) })} />
            </div>
          </div>
          <div role="group" aria-label={t('editor.align')} className="flex gap-2">
            {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([k, Icon]) => (
              <button key={k} type="button" className={`btn btn-icon ${(current.align ?? 'left') === k ? 'btn-primary' : ''}`} aria-pressed={(current.align ?? 'left') === k} aria-label={t(`editor.align_${k}`)} title={t(`editor.align_${k}`)} onClick={() => patch({ align: k as TextAlign })}>
                <Icon aria-hidden size={18} />
              </button>
            ))}
          </div>
          {current.sourceFont && <p className="text-sm text-muted">{t('editor.sourceFont', { name: current.sourceFont })}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn" disabled={current.text === current.original} onClick={() => patch({ text: current.original })}>{t('editor.restore')}</button>
            <button type="button" className="btn" disabled={current.text === ''} onClick={() => patch({ text: '' })}>{t('editor.clearText')}</button>
          </div>
        </div>
      )}
          </aside>
        )}
      </div>

      <SignatureDialog open={dialog === 'signature'} onClose={() => { setDialog(null); if (!signature) setTool('select') }} onDone={(a) => {
        setSignature(a)
        setDialog(null)
        place(lastPage, { x: sizes[lastPage]!.width / 2, y: sizes[lastPage]!.height / 2 }, 'signature', { signature: a })
      }} />
      <Modal open={dialog === 'initials'} title={t('editor.initialsTitle')} onClose={() => { setDialog(null); if (!initials) setTool('select') }}>
        <form onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('initials') ?? '').trim(); if (v) { setInitials(v); setDialog(null) } }}>
          <label htmlFor="initials" className="field-label">{t('editor.initialsLabel')}</label>
          <input id="initials" name="initials" className="field-input" maxLength={6} autoFocus required />
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" className="btn" onClick={() => { setDialog(null); if (!initials) setTool('select') }}>{t('library.cancel')}</button>
            <button type="submit" className="btn btn-primary">{t('library.save')}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

interface SurfaceProps {
  index: number
  size: { width: number; height: number }
  renderer: PdfRenderer
  anns: Annotation[]
  draft: Annotation | null
  selected: string | null
  select: boolean
  cursor: string
  onDown: (page: number, e: React.PointerEvent<SVGSVGElement>) => void
  onMove: (page: number, e: React.PointerEvent<SVGSVGElement>) => void
  onUp: () => void
  startDrag: (a: Annotation, kind: 'move' | 'resize' | 'p1' | 'p2', e: React.PointerEvent, svg: SVGSVGElement) => void
  segments: Block[]
  onPickSegment: (seg: Block, point?: Pt) => void
  /** Khối chữ đang sửa tại chỗ trên trang này (nếu có). */
  editing: Extract<Annotation, { type: 'textEdit' }> | null
  takeCaret: (id: string) => Pt | null
  onEditText: (text: string) => void
  onCloseEdit: () => void
}

function PageSurface({ index, size, renderer, anns, draft, selected, select, cursor, onDown, onMove, onUp, startDrag, segments, onPickSegment, editing, takeCaret, onEditText, onCloseEdit }: SurfaceProps) {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let alive = true
    const io = new IntersectionObserver((es) => {
      if (es.some((x) => x.isIntersecting)) {
        io.disconnect()
        void renderer.render(index, 1000).then((u) => alive && setSrc(u)).catch(() => undefined)
      }
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => { alive = false; io.disconnect() }
  }, [renderer, index])

  const all = useMemo(() => (draft ? [...anns, draft] : anns), [anns, draft])

  return (
    <section aria-label={t('editor.pageN', { n: index + 1 })}>
      <p className="mb-1 text-sm text-muted">{t('editor.pageN', { n: index + 1 })}</p>
      <div ref={host} data-page-host className="relative mx-auto w-full max-w-[860px] overflow-hidden rounded-[var(--r-sm)] border border-line bg-white shadow-sm" style={{ aspectRatio: `${size.width} / ${size.height}`, containerType: 'inline-size' }}>
        {src && <img src={src} alt="" draggable={false} className="absolute inset-0 size-full select-none" />}
        <svg
          ref={svg}
          data-testid={`page-${index}`}
          viewBox={`0 0 ${size.width} ${size.height}`}
          className="absolute inset-0 size-full touch-none"
          style={{ cursor }}
          onPointerDown={(e) => onDown(index, e)}
          onPointerMove={(e) => onMove(index, e)}
          onPointerUp={onUp}
        >
          {all.map((a) => (
            <Shape key={a.id} a={a} selected={a.id === selected} interactive={select} hideText={a.id === editing?.id} onStart={(kind, e) => svg.current && startDrag(a, kind, e, svg.current)} />
          ))}
          {segments.map((seg, k) => (
            <polygon
              key={k}
              className="seg-hit"
              points={segmentCorners(seg, 1).map((c) => c.join(',')).join(' ')}
              role="button"
              tabIndex={0}
              aria-label={t('editor.editSegment', { text: seg.text })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                const r = svg.current!.getBoundingClientRect()
                onPickSegment(seg, { x: ((e.clientX - r.left) / r.width) * size.width, y: ((e.clientY - r.top) / r.height) * size.height })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onPickSegment(seg)
                }
              }}
            />
          ))}
        </svg>
        {editing && <InlineTextEditor key={editing.id} a={editing} page={size} takeCaret={takeCaret} onChange={onEditText} onClose={onCloseEdit} />}
      </div>
    </section>
  )
}

function AnnImage({ a, ...rest }: { a: Extract<Annotation, { type: 'image' }> } & React.SVGProps<SVGImageElement>) {
  const url = useObjectUrl(a.data)
  return <image href={url} x={a.x} y={a.y} width={a.w} height={a.h} preserveAspectRatio="none" {...rest} />
}

function Shape({ a, selected, interactive, hideText = false, onStart }: { a: Annotation; selected: boolean; interactive: boolean; hideText?: boolean; onStart: (kind: 'move' | 'resize' | 'p1' | 'p2', e: React.PointerEvent) => void }) {
  const events = interactive ? { onPointerDown: (e: React.PointerEvent) => onStart('move', e), style: { cursor: 'move' } } : { style: { pointerEvents: 'none' as const } }
  const b = bbox(a)
  let body: React.ReactNode
  switch (a.type) {
    case 'ink': body = <polyline points={a.points.map((p) => p.join(',')).join(' ')} fill="none" stroke={a.color} strokeWidth={a.width} strokeLinecap="round" strokeLinejoin="round" {...events} />; break
    case 'highlight': body = <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={a.color} opacity={0.4} style={{ mixBlendMode: 'multiply', ...events.style }} onPointerDown={'onPointerDown' in events ? events.onPointerDown : undefined} />; break
    case 'redact': body = <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="#000" fillOpacity={0.6} stroke="#dc2626" strokeWidth={1} strokeDasharray="4 2" {...events} />; break
    case 'whiteout': body = <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="#fff" stroke="#9ca3af" strokeDasharray="3 2" strokeWidth={0.5} {...events} />; break
    case 'rect': body = <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={a.fill ? a.color : 'none'} stroke={a.color} strokeWidth={a.width} {...events} />; break
    case 'ellipse': body = <ellipse cx={a.x + a.w / 2} cy={a.y + a.h / 2} rx={a.w / 2} ry={a.h / 2} fill={a.fill ? a.color : 'none'} stroke={a.color} strokeWidth={a.width} {...events} />; break
    case 'line': case 'arrow': {
      const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1)
      const head = Math.max(8, a.width * 4)
      const w1 = [a.x2 - head * Math.cos(ang + 0.45), a.y2 - head * Math.sin(ang + 0.45)]
      const w2 = [a.x2 - head * Math.cos(ang - 0.45), a.y2 - head * Math.sin(ang - 0.45)]
      body = (
        <g {...events}>
          <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth={a.width} strokeLinecap="round" />
          {a.type === 'arrow' && <polyline points={`${w1.join(',')} ${a.x2},${a.y2} ${w2.join(',')}`} fill="none" stroke={a.color} strokeWidth={a.width} strokeLinecap="round" />}
          <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="transparent" strokeWidth={Math.max(10, a.width + 8)} />
        </g>
      )
      break
    }
    case 'text': body = <text x={a.x} fontFamily='"DejaVu Sans", sans-serif' fontSize={a.size} fill={a.color} {...events}>{a.text.split('\n').map((l, i) => <tspan key={i} x={a.x} y={a.y + a.size * 0.9 + i * a.size * 1.2}>{l || ' '}</tspan>)}</text>; break
    case 'textEdit': {
      const th = -a.angle
      const family = cssFamily(a.family)
      const face = `${a.italic ? 'italic ' : ''}${a.bold ? 'bold ' : ''}${a.size}px ${family}`
      void document.fonts?.load(face) // nạp phông xem trước (khi xong sẽ vẽ lại)
      const lines = wrapParagraphs(a.text, measurer(face), a.lines > 1 ? a.w : 0)
      body =
        a.text === a.original ? (
          <polygon points={segmentCorners(a, 1).map((c) => c.join(',')).join(' ')} fill="transparent" {...events} />
        ) : (
          <g {...events}>
            {/* Che chữ gốc từng dòng, đúng như khi xuất khi không xóa được ở tầng nội dung */}
            {a.parts.map((pt, k) => (
              <polygon key={k} points={segmentCorners({ x: pt.x, baseline: pt.baseline, angle: a.angle, w: pt.w, size: a.size }, 1).map((c) => c.join(',')).join(' ')} fill="#fff" />
            ))}
            {!hideText && <text transform={`translate(${a.x} ${a.baseline}) rotate(${th})`} fontFamily={family} fontSize={a.size} fontWeight={a.bold ? 700 : 400} fontStyle={a.italic ? 'italic' : 'normal'} fill={a.color}>
              {lines.map((l, i) => <tspan key={i} x={alignOffset(a.align, a.w, measurer(face)(l))} y={i * a.lineHeight}>{l || ' '}</tspan>)}
            </text>}
          </g>
        )
      break
    }
    case 'image': body = <AnnImage a={a} {...events} />; break
    case 'checkbox': body = (
      <g {...events}>
        <rect x={a.x} y={a.y} width={a.size} height={a.size} fill="#fff" fillOpacity={0.01} stroke={a.color} strokeWidth={Math.max(1, a.size / 12)} />
        {a.checked && <polyline points={`${a.x + a.size * 0.2},${a.y + a.size * 0.55} ${a.x + a.size * 0.42},${a.y + a.size * 0.78} ${a.x + a.size * 0.82},${a.y + a.size * 0.25}`} fill="none" stroke={a.color} strokeWidth={Math.max(1.5, a.size / 9)} strokeLinecap="round" strokeLinejoin="round" />}
      </g>
    ); break
  }
  const rectLike = ['highlight', 'whiteout', 'redact', 'rect', 'ellipse', 'image', 'checkbox', 'text'].includes(a.type) // textEdit: không đổi cỡ bằng tay cầm (dùng ô cỡ chữ)
  return (
    <g data-annotation={a.type} data-selected={selected || undefined}>
      {body}
      {selected && interactive && (
        <>
          <rect x={b.x - 2} y={b.y - 2} width={b.w + 4} height={b.h + 4} fill="none" stroke="#0f6f6a" strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />
          {rectLike && <circle data-handle="resize" cx={b.x + b.w + 2} cy={b.y + b.h + 2} r={5} fill="#0f6f6a" stroke="#fff" strokeWidth={1} style={{ cursor: 'nwse-resize' }} onPointerDown={(e) => onStart('resize', e)} />}
          {(a.type === 'line' || a.type === 'arrow') && (
            <>
              <circle data-handle="p1" cx={a.x1} cy={a.y1} r={5} fill="#0f6f6a" stroke="#fff" strokeWidth={1} style={{ cursor: 'pointer' }} onPointerDown={(e) => onStart('p1', e)} />
              <circle data-handle="p2" cx={a.x2} cy={a.y2} r={5} fill="#0f6f6a" stroke="#fff" strokeWidth={1} style={{ cursor: 'pointer' }} onPointerDown={(e) => onStart('p2', e)} />
            </>
          )}
        </>
      )}
    </g>
  )
}
