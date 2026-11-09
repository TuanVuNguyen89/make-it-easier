import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

// URL xem trước gắn với vòng đời của `bytes`: tạo một lần, tự thu hồi khi bytes bị thu gom.
// (Thu hồi trong cleanup của effect sẽ làm hỏng ảnh ở StrictMode, vì effect chạy-dọn-chạy lại.)
const urlCache = new WeakMap<Uint8Array, string>()
const urlRegistry = new FinalizationRegistry<string>((url) => URL.revokeObjectURL(url))

export function useObjectUrl(bytes: Uint8Array): string {
  let url = urlCache.get(bytes)
  if (!url) {
    url = URL.createObjectURL(new Blob([bytes as BlobPart]))
    urlCache.set(bytes, url)
    urlRegistry.register(bytes, url)
  }
  return url
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Cắt ảnh: kéo khung trên ảnh hoặc nhập số (bàn phím dùng được). Báo {x, y, width, height} theo pixel ảnh gốc. */
export function ImageCropEditor({ bytes, onChange }: { bytes: Uint8Array; onChange: (o: Rect) => void }) {
  const { t } = useTranslation()
  const url = useObjectUrl(bytes)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; start: Rect } | null>(null)
  const ids = [useId(), useId(), useId(), useId()]

  const set = (r: Rect) => {
    setRect(r)
    onChange(r)
  }

  type Mode = 'move' | 'nw' | 'ne' | 'sw' | 'se'
  const begin = (mode: Mode, e: React.PointerEvent) => {
    if (!rect) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: rect }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !natural || !box.current) return
    const k = natural.w / box.current.getBoundingClientRect().width // pixel ảnh gốc trên mỗi pixel màn hình
    const dx = Math.round((e.clientX - d.startX) * k)
    const dy = Math.round((e.clientY - d.startY) * k)
    const s = d.start
    if (d.mode === 'move') {
      set({ ...s, x: clamp(s.x + dx, 0, natural.w - s.width), y: clamp(s.y + dy, 0, natural.h - s.height) })
      return
    }
    let left = s.x
    let top = s.y
    let right = s.x + s.width
    let bottom = s.y + s.height
    if (d.mode.includes('w')) left = clamp(s.x + dx, 0, right - 1)
    else right = clamp(right + dx, left + 1, natural.w)
    if (d.mode.includes('n')) top = clamp(s.y + dy, 0, bottom - 1)
    else bottom = clamp(bottom + dy, top + 1, natural.h)
    set({ x: left, y: top, width: right - left, height: bottom - top })
  }
  const end = () => {
    drag.current = null
  }

  const fields: [keyof Rect, string, number][] = natural
    ? [
        ['x', 'imageEditor.cropX', natural.w - 1],
        ['y', 'imageEditor.cropY', natural.h - 1],
        ['width', 'imageEditor.cropWidth', natural.w],
        ['height', 'imageEditor.cropHeight', natural.h],
      ]
    : []

  const setField = (key: keyof Rect, raw: number, max: number) => {
    if (!rect || !natural || !Number.isFinite(raw)) return
    const v = Math.round(raw)
    const next = { ...rect, [key]: clamp(v, key === 'width' || key === 'height' ? 1 : 0, max) }
    next.width = clamp(next.width, 1, natural.w - next.x)
    next.height = clamp(next.height, 1, natural.h - next.y)
    set(next)
  }

  return (
    <div>
      <p className="text-muted">{t('imageEditor.cropHint')}</p>
      <div ref={box} className="relative mt-3 max-w-2xl select-none overflow-hidden rounded-[var(--r-md)] border border-line bg-bg touch-none">
        {(
          <img
            src={url}
            alt={t('imageEditor.preview')}
            draggable={false}
            className="block w-full"
            onLoad={(e) => {
              const img = e.currentTarget
              const n = { w: img.naturalWidth, h: img.naturalHeight }
              setNatural(n)
              const r = { x: 0, y: 0, width: n.w, height: n.h }
              setRect(r)
              onChange(r)
            }}
          />
        )}
        {natural && rect && (
          <div
            data-testid="crop-box"
            onPointerDown={(e) => begin('move', e)}
            onPointerMove={move}
            onPointerUp={end}
            className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{
              left: `${(rect.x / natural.w) * 100}%`,
              top: `${(rect.y / natural.h) * 100}%`,
              width: `${(rect.width / natural.w) * 100}%`,
              height: `${(rect.height / natural.h) * 100}%`,
            }}
          >
            {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
              <span
                key={h}
                onPointerDown={(e) => begin(h, e)}
                onPointerMove={move}
                onPointerUp={end}
                className="absolute size-4 rounded-full border-2 border-white bg-action"
                style={{
                  left: h.includes('w') ? -8 : undefined,
                  right: h.includes('e') ? -8 : undefined,
                  top: h.includes('n') ? -8 : undefined,
                  bottom: h.includes('s') ? -8 : undefined,
                  cursor: h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize',
                }}
              />
            ))}
          </div>
        )}
      </div>
      {natural && rect && (
        <div className="mt-4 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
          {fields.map(([key, label, max], i) => (
            <div key={key}>
              <label htmlFor={ids[i]} className="field-label">
                {t(label)}
              </label>
              <input id={ids[i]} type="number" inputMode="numeric" className="field-input" min={key === 'width' || key === 'height' ? 1 : 0} max={max} value={rect[key]} onChange={(e) => setField(key, e.target.valueAsNumber, max)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Xóa đối tượng: tô lên vùng cần xóa. Báo mask (Uint8Array, khác 0 là vùng tô) cùng kích thước ảnh gốc, hoặc {} khi chưa tô. */
export function ImageMaskEditor({ bytes, onChange }: { bytes: Uint8Array; onChange: (o: Record<string, unknown>) => void }) {
  const { t } = useTranslation()
  const url = useObjectUrl(bytes)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [brush, setBrush] = useState(24)
  const painting = useRef<{ x: number; y: number } | null>(null)
  const brushId = useId()

  const pos = (e: React.PointerEvent) => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }
  const dot = (p: { x: number; y: number }, from: { x: number; y: number }) => {
    const g = canvas.current!.getContext('2d')!
    const scale = canvas.current!.width / canvas.current!.getBoundingClientRect().width
    g.strokeStyle = g.fillStyle = 'rgba(220, 38, 38, 0.55)'
    g.lineCap = g.lineJoin = 'round'
    g.lineWidth = brush * scale
    g.beginPath()
    g.moveTo(from.x, from.y)
    g.lineTo(p.x, p.y)
    g.stroke()
  }
  const commit = () => {
    const c = canvas.current!
    const px = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    const mask = new Uint8Array(c.width * c.height)
    let any = false
    for (let i = 0; i < mask.length; i++) {
      if (px[i * 4 + 3]! > 20) {
        mask[i] = 255
        any = true
      }
    }
    onChange(any ? { mask, maskWidth: c.width, maskHeight: c.height } : {})
  }
  const clear = () => {
    const c = canvas.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    onChange({})
  }

  return (
    <div>
      <p className="text-muted">{t('imageEditor.maskHint')}</p>
      <div className="relative mt-3 max-w-2xl select-none overflow-hidden rounded-[var(--r-md)] border border-line bg-bg touch-none">
        {(
          <img
            src={url}
            alt={t('imageEditor.preview')}
            draggable={false}
            className="block w-full"
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
        )}
        {natural && (
          <canvas
            ref={canvas}
            data-testid="mask-canvas"
            width={natural.w}
            height={natural.h}
            aria-label={t('imageEditor.maskCanvas')}
            className="absolute inset-0 size-full cursor-crosshair"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              const p = pos(e)
              painting.current = p
              dot(p, p)
            }}
            onPointerMove={(e) => {
              if (!painting.current) return
              const p = pos(e)
              dot(p, painting.current)
              painting.current = p
            }}
            onPointerUp={() => {
              painting.current = null
              commit()
            }}
          />
        )}
      </div>
      <div className="mt-4 flex max-w-2xl flex-wrap items-end gap-4">
        <div className="min-w-48 flex-1">
          <label htmlFor={brushId} className="field-label">
            {t('imageEditor.brush', { size: brush })}
          </label>
          <input id={brushId} type="range" min={4} max={100} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="w-full accent-[var(--action)]" />
        </div>
        <button type="button" className="btn" onClick={clear}>
          {t('imageEditor.clearMask')}
        </button>
      </div>
    </div>
  )
}
