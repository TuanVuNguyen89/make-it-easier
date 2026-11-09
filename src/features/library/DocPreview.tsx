import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPdfRenderer, type PdfRenderer } from '@/lib/pdfRender'
import { useRepository } from '@/storage/RepositoryProvider'
import type { DocumentRecord } from '@/storage/types'

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'pdf'; renderer: PdfRenderer; sizes: { width: number; height: number }[] }
  | { kind: 'image'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'none' }

/** Xem trước tài liệu trong thư viện: PDF (từng trang, vẽ khi cuộn tới), ảnh, văn bản. Mọi thứ chạy trên máy. */
export function DocPreview({ doc }: { doc: DocumentRecord }) {
  const repo = useRepository()
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let alive = true
    let cleanup = () => {}
    ;(async () => {
      try {
        const bytes = await repo.getBytes(doc.id)
        if (!alive) return
        if (doc.mime === 'application/pdf') {
          const renderer = await createPdfRenderer(bytes)
          if (!alive) return renderer.destroy()
          const sizes = await Promise.all(Array.from({ length: renderer.pageCount }, (_, i) => renderer.pageSize(i)))
          cleanup = () => renderer.destroy()
          if (alive) setState({ kind: 'pdf', renderer, sizes })
        } else if (doc.mime.startsWith('image/')) {
          const url = URL.createObjectURL(new Blob([bytes.slice()], { type: doc.mime }))
          cleanup = () => URL.revokeObjectURL(url)
          setState({ kind: 'image', url })
        } else if (doc.mime.startsWith('text/')) {
          setState({ kind: 'text', text: new TextDecoder().decode(bytes.slice(0, 200_000)) })
        } else setState({ kind: 'none' })
      } catch {
        if (alive) setState({ kind: 'error' })
      }
    })()
    return () => {
      alive = false
      cleanup()
    }
  }, [repo, doc.id, doc.mime])

  if (state.kind === 'loading') return <p role="status" className="text-muted">{t('library.previewLoading')}</p>
  if (state.kind === 'error') return <p role="alert" className="notice notice-error">{t('library.previewError')}</p>
  if (state.kind === 'none') return <p className="text-muted">{t('library.previewNone')}</p>
  if (state.kind === 'image') return <img src={state.url} alt={doc.name} className="mx-auto max-h-[70vh] max-w-full object-contain" />
  if (state.kind === 'text') return <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-[var(--r-sm)] border border-line bg-bg p-3 text-sm" tabIndex={0}>{state.text}</pre>
  return (
    <div className="grid max-h-[70vh] gap-4 overflow-auto rounded-[var(--r-sm)] bg-bg p-2" tabIndex={0} aria-label={doc.name}>
      {state.sizes.map((size, i) => (
        <PreviewPage key={i} index={i} size={size} renderer={state.renderer} label={t('library.previewPage', { n: i + 1 })} />
      ))}
    </div>
  )
}

function PreviewPage({ index, size, renderer, label }: { index: number; size: { width: number; height: number }; renderer: PdfRenderer; label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        void renderer.render(index, 900).then(setSrc, () => {})
      },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [renderer, index])
  return (
    <div ref={host} className="mx-auto w-full max-w-[720px] border border-line bg-white shadow-sm" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
      {src && <img src={src} alt={label} className="size-full" />}
    </div>
  )
}
