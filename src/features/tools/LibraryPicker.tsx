import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRepository } from '@/storage/RepositoryProvider'
import type { DocumentRecord } from '@/storage/types'
import { formatBytes } from '@/lib/format'

interface Props {
  open: boolean
  mimes: string[]
  onAdd: (ids: string[]) => void
  onClose: () => void
}

/** Hộp thoại chọn tệp từ thư viện, dùng <dialog> gốc để có sẵn bẫy focus, Esc và trả focus. */
export function LibraryPicker({ open, mimes, onAdd, onClose }: Props) {
  const { t } = useTranslation()
  const repo = useRepository()
  const ref = useRef<HTMLDialogElement>(null)
  const [docs, setDocs] = useState<DocumentRecord[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (open && !dlg.open) {
      setPicked(new Set())
      void repo.listDocuments({ view: 'all', scope: 'everywhere' }).then((all) => {
        setDocs(all.filter((d) => mimes.includes(d.mime)))
      })
      dlg.showModal()
    } else if (!open && dlg.open) {
      dlg.close()
    }
  }, [open, repo, mimes])

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="picker-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--r-lg)] border border-line bg-surface p-6 text-ink backdrop:bg-black/40"
    >
      <h2 id="picker-title" className="section-title">
        {t('toolPage.pickerTitle')}
      </h2>
      {docs.length === 0 ? (
        <p className="mt-4 text-muted">{t('toolPage.pickerEmpty')}</p>
      ) : (
        <ul className="mt-4 max-h-80 overflow-auto">
          {docs.map((d) => (
            <li key={d.id}>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--action)]"
                  checked={picked.has(d.id)}
                  onChange={() => toggle(d.id)}
                />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="text-sm text-muted">{formatBytes(d.size)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="btn" onClick={onClose}>
          {t('toolPage.close')}
        </button>
        <button type="button" className="btn btn-primary" disabled={picked.size === 0} onClick={() => onAdd([...picked])}>
          {t('toolPage.pickerAdd')}
        </button>
      </div>
    </dialog>
  )
}
