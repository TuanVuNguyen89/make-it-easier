import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, RotateCcw, RotateCw, Trash2 } from 'lucide-react'
import { createPdfRenderer, type PdfRenderer } from '@/lib/pdfRender'
import { ToolError } from '@/tools/types'
import type { PageSpec } from '@/tools/organize-pages/run'

interface Entry extends PageSpec {
  id: number
}

interface Props {
  bytes: Uint8Array
  onChange: (pages: PageSpec[]) => void
}

const THUMB = 160

/** Lưới trang: kéo thả hoặc dùng nút để đổi thứ tự, xoay, xóa. Báo danh sách trang cuối cùng qua onChange. */
export function PageEditor({ bytes, onChange }: Props) {
  const { t } = useTranslation()
  const [renderer, setRenderer] = useState<PdfRenderer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const dragFrom = useRef<number | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    let alive = true
    let made: PdfRenderer | null = null
    createPdfRenderer(bytes)
      .then((r) => {
        if (!alive) return r.destroy()
        made = r
        setRenderer(r)
        const list = Array.from({ length: r.pageCount }, (_, i) => ({ id: i, src: i, rotate: 0 }))
        setEntries(list)
        onChangeRef.current(list.map(({ src, rotate }) => ({ src, rotate })))
      })
      .catch((e) => alive && setError(t(`errors.${e instanceof ToolError ? e.code : 'unknown'}`)))
    return () => {
      alive = false
      made?.destroy()
    }
  }, [bytes, t])

  const update = (next: Entry[]) => {
    setEntries(next)
    onChange(next.map(({ src, rotate }) => ({ src, rotate })))
  }
  const move = (from: number, to: number) => {
    if (to < 0 || to >= entries.length || from === to) return
    const next = [...entries]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item!)
    update(next)
  }

  if (error) return <p role="alert" className="notice notice-error">{error}</p>
  if (!renderer) return <p className="text-muted">…</p>

  return (
    <div>
      <p className="text-muted" role="status">
        {t('editor.pagesLeft', { count: entries.length })}
      </p>
      <ol className="mt-3 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
        {entries.map((e, i) => (
          <li
            key={e.id}
            draggable
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={() => {
              if (dragFrom.current !== null) move(dragFrom.current, i)
              dragFrom.current = null
            }}
            className="card !p-3"
          >
            <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[var(--r-sm)] bg-bg">
              <Thumb renderer={renderer} index={e.src} rotate={e.rotate} label={t('editor.pageLabel', { n: e.src + 1 })} />
            </div>
            <p className="mt-2 text-center text-sm text-muted">
              {i + 1} <span className="sr-only">({t('editor.pageLabel', { n: e.src + 1 })})</span>
            </p>
            <div className="mt-1 flex justify-center">
              <Btn label={t('editor.moveEarlier', { n: i + 1 })} disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ArrowLeft aria-hidden size={16} />
              </Btn>
              <Btn label={t('editor.rotateLeft', { n: i + 1 })} onClick={() => update(entries.map((x) => (x === e ? { ...x, rotate: (x.rotate + 270) % 360 } : x)))}>
                <RotateCcw aria-hidden size={16} />
              </Btn>
              <Btn label={t('editor.rotateRight', { n: i + 1 })} onClick={() => update(entries.map((x) => (x === e ? { ...x, rotate: (x.rotate + 90) % 360 } : x)))}>
                <RotateCw aria-hidden size={16} />
              </Btn>
              <Btn label={t('editor.remove', { n: i + 1 })} disabled={entries.length === 1} onClick={() => update(entries.filter((x) => x !== e))}>
                <Trash2 aria-hidden size={16} />
              </Btn>
              <Btn label={t('editor.moveLater', { n: i + 1 })} disabled={i === entries.length - 1} onClick={() => move(i, i + 1)}>
                <ArrowRight aria-hidden size={16} />
              </Btn>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Btn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" className="btn btn-icon border-transparent bg-transparent" style={{ width: 36, minHeight: 36 }} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

/** Chỉ vẽ khi thumbnail vào vùng nhìn thấy (render lười). */
function Thumb({ renderer, index, rotate, label }: { renderer: PdfRenderer; index: number; rotate: number; label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let alive = true
    const io = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting)) {
        io.disconnect()
        void renderer.render(index, THUMB * 2).then((u) => alive && setSrc(u)).catch(() => undefined)
      }
    })
    io.observe(el)
    return () => {
      alive = false
      io.disconnect()
    }
  }, [renderer, index])

  return (
    <div ref={host} className="flex size-full items-center justify-center">
      {src && (
        <img
          src={src}
          alt={label}
          draggable={false}
          className="max-h-full max-w-full object-contain transition-transform"
          style={{ transform: `rotate(${rotate}deg)` }}
        />
      )}
    </div>
  )
}
