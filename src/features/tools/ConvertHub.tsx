import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, FolderOpen, Upload } from 'lucide-react'
import { detectKind, targetsFor } from '@/lib/convertTargets'
import { formatBytes } from '@/lib/format'
import { useRepository } from '@/storage/RepositoryProvider'
import { getTool } from '@/tools/registry'
import { LibraryPicker } from './LibraryPicker'
import { setHandoff, type HandoffFile } from './handoff'

const ALL_MIMES = [
  'application/pdf', 'text/plain', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif', 'image/tiff',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

/** Trang "Chuyển đổi PDF": chọn một tệp, nhận ra loại, gợi ý các định dạng đích rồi đi tới đúng công cụ với tệp đã chọn. */
export function ConvertHub() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const repo = useRepository()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<HandoffFile | null>(null)
  const [picker, setPicker] = useState(false)
  const [dragging, setDragging] = useState(false)

  const pick = async (f: File) => setFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
  const targets = file ? targetsFor(file.name).filter((id) => getTool(id)) : []
  const unsupported = file !== null && targets.length === 0

  return (
    <div className="max-w-3xl">
      <Link to="/tools" className="inline-flex min-h-11 items-center gap-2 text-muted hover:text-ink">
        <ArrowLeft aria-hidden size={18} />
        {t('toolPage.back')}
      </Link>
      <h1 className="page-title mt-2">{t('tools.convert.name')}</h1>
      <p className="mt-2 max-w-[62ch] text-muted">{t('tools.convert.desc')}</p>

      <div
        className={`mt-6 rounded-[var(--r-lg)] border border-dashed p-5 ${dragging ? 'border-action bg-[rgb(15_111_106/0.06)]' : 'border-line'}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void pick(f) }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={() => input.current?.click()}>
            <Upload aria-hidden size={18} />
            {t('toolPage.addFromDevice')}
          </button>
          <button type="button" className="btn" onClick={() => setPicker(true)}>
            <FolderOpen aria-hidden size={18} />
            {t('toolPage.addFromLibrary')}
          </button>
          <span className="text-muted">{t('toolPage.dropHint')}</span>
        </div>
        <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f) }} />
        <p className="mt-4" role="status">
          {file ? (
            <>
              <span className="font-medium">{file.name}</span> <span className="text-muted">({formatBytes(file.bytes.byteLength)} · {t(`convertHub.kind.${detectKind(file.name)}`)})</span>
            </>
          ) : (
            <span className="text-muted">{t('toolPage.noFiles')}</span>
          )}
        </p>
      </div>

      {unsupported && <p role="alert" className="notice notice-error mt-4">{t('convertHub.unsupported')}</p>}
      {targets.length > 0 && (
        <section className="mt-6" aria-labelledby="targets-h">
          <h2 id="targets-h" className="section-title">{t('convertHub.convertTo')}</h2>
          <ul className="mt-3 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {targets.map((id) => {
              const Icon = getTool(id)!.icon
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="card card-link h-full w-full text-left"
                    onClick={() => { setHandoff([file!]); navigate(`/tools/${id}`) }}
                  >
                    <Icon aria-hidden size={26} className="text-action" />
                    <span className="mt-2 block font-display font-semibold">{t(`tools.${id}.name`)}</span>
                    <span className="mt-1 block text-muted">{t(`tools.${id}.desc`)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <LibraryPicker
        open={picker}
        mimes={ALL_MIMES}
        onAdd={async (ids) => {
          setPicker(false)
          const doc = ids[0] ? await repo.getDocument(ids[0]) : undefined
          if (doc) setFile({ name: doc.name, bytes: await repo.getBytes(doc.id) })
        }}
        onClose={() => setPicker(false)}
      />
    </div>
  )
}

