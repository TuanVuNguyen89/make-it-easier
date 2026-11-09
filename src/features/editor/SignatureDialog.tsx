import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import '@fontsource/dancing-script/600.css'
import { Modal } from '@/components/Modal'

export interface Asset {
  data: Uint8Array
  w: number
  h: number
}

const STORE = 'signature:v1'

/** Cắt khoảng trống quanh nét vẽ rồi xuất PNG trong suốt. */
async function trim(canvas: HTMLCanvasElement): Promise<Asset | null> {
  const g = canvas.getContext('2d')!
  const { width, height } = canvas
  const px = g.getImageData(0, 0, width, height).data
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null
  const pad = 4
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d')!.drawImage(canvas, x0, y0, w, h, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'))
  return blob ? { data: new Uint8Array(await blob.arrayBuffer()), w, h } : null
}

function loadSaved(): Asset | null {
  try {
    const raw = localStorage.getItem(STORE)
    if (!raw) return null
    const { b64, w, h } = JSON.parse(raw) as { b64: string; w: number; h: number }
    return { data: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), w, h }
  } catch {
    return null
  }
}
function save(a: Asset) {
  try {
    let s = ''
    a.data.forEach((b) => (s += String.fromCharCode(b)))
    localStorage.setItem(STORE, JSON.stringify({ b64: btoa(s), w: a.w, h: a.h }))
  } catch {
    /* bộ nhớ bị chặn hoặc đầy: bỏ qua, chữ ký vẫn dùng được trong phiên này */
  }
}

type Tab = 'draw' | 'type' | 'upload'

export function SignatureDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (a: Asset) => void }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('draw')
  const [typed, setTyped] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved] = useState(loadSaved)
  const draw = useRef<HTMLCanvasElement>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const uploaded = useRef<Asset | null>(null)
  const typedId = useId()

  useEffect(() => {
    if (tab !== 'type' || !preview.current) return
    const c = preview.current
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    if (!typed.trim()) return
    void document.fonts.load('600 80px "Dancing Script"', typed).then(() => {
      g.clearRect(0, 0, c.width, c.height)
      g.fillStyle = '#111827'
      g.textBaseline = 'middle'
      g.font = '600 80px "Dancing Script", cursive'
      g.fillText(typed, 20, c.height / 2, c.width - 40)
    })
  }, [typed, tab])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height }
  }

  const finish = async () => {
    setError(null)
    let asset: Asset | null
    if (tab === 'draw') asset = await trim(draw.current!)
    else if (tab === 'type') {
      await document.fonts.load('600 80px "Dancing Script"', typed)
      asset = await trim(preview.current!)
    } else asset = uploaded.current
    if (!asset) return setError(t('signature.empty'))
    if (remember) save(asset)
    onDone(asset)
  }

  const tabs: [Tab, string][] = [['draw', 'signature.draw'], ['type', 'signature.type'], ['upload', 'signature.upload']]
  return (
    <Modal open={open} title={t('signature.title')} onClose={onClose}>
      <div role="tablist" aria-label={t('signature.title')} className="flex gap-2 border-b border-line">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="tab" aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
            {t(label)}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === 'draw' && (
          <div>
            <canvas
              ref={draw}
              width={560}
              height={200}
              aria-label={t('signature.drawArea')}
              className="w-full touch-none rounded-[var(--r-md)] border border-line bg-white"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                last.current = pos(e)
              }}
              onPointerMove={(e) => {
                if (!last.current) return
                const p = pos(e)
                const g = e.currentTarget.getContext('2d')!
                g.strokeStyle = '#111827'
                g.lineWidth = 3
                g.lineCap = g.lineJoin = 'round'
                g.beginPath()
                g.moveTo(last.current.x, last.current.y)
                g.lineTo(p.x, p.y)
                g.stroke()
                last.current = p
              }}
              onPointerUp={() => (last.current = null)}
            />
            <button type="button" className="btn mt-2" onClick={() => draw.current!.getContext('2d')!.clearRect(0, 0, 560, 200)}>
              {t('signature.clear')}
            </button>
          </div>
        )}
        {tab === 'type' && (
          <div>
            <label htmlFor={typedId} className="field-label">
              {t('signature.typeLabel')}
            </label>
            <input id={typedId} className="field-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            <canvas ref={preview} width={560} height={140} aria-hidden className="mt-3 w-full rounded-[var(--r-md)] border border-line bg-white" />
          </div>
        )}
        {tab === 'upload' && (
          <div>
            <label className="field-label" htmlFor={`${typedId}-file`}>
              {t('signature.uploadLabel')}
            </label>
            <input
              id={`${typedId}-file`}
              type="file"
              accept="image/png,image/jpeg"
              className="field-input pt-2.5"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const bmp = await createImageBitmap(f).catch(() => null)
                if (!bmp) return setError(t('errors.invalid-image'))
                uploaded.current = { data: new Uint8Array(await f.arrayBuffer()), w: bmp.width, h: bmp.height }
                setError(null)
              }}
            />
          </div>
        )}
      </div>
      {saved && (
        <button type="button" className="btn mt-4" onClick={() => onDone(saved)}>
          {t('signature.useSaved')}
        </button>
      )}
      <label className="mt-4 flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-5 accent-[var(--action)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>{t('signature.remember')}</span>
      </label>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="btn" onClick={onClose}>
          {t('library.cancel')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void finish()}>
          {t('signature.use')}
        </button>
      </div>
    </Modal>
  )
}
