import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Download,
  FileText,
  Files,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  Image as ImageIcon,
  Pencil,
  RotateCcw,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import { Modal } from '@/components/Modal'
import { formatBytes } from '@/lib/format'
import { detectMime } from '@/lib/mime'
import { useRepository } from '@/storage/RepositoryProvider'
import type { DocumentRecord, FolderRecord, LibraryView } from '@/storage/types'
import { uploadFiles } from './upload'
import { DocPreview } from './DocPreview'

const VIEWS = ['all', 'recent', 'favorites', 'trash'] as const
type Sort = 'updated' | 'name' | 'size'
type Dialog =
  | { kind: 'folder' }
  | { kind: 'rename'; item: Item }
  | { kind: 'move'; items: Item[] }
  | { kind: 'purge'; items: DocumentRecord[] }
  | { kind: 'emptyTrash' }
  | { kind: 'preview'; doc: DocumentRecord }
  | null

type Item = { type: 'folder'; folder: FolderRecord } | { type: 'doc'; doc: DocumentRecord }
const itemKey = (i: Item) => (i.type === 'folder' ? `f:${i.folder.id}` : `d:${i.doc.id}`)
const itemName = (i: Item) => (i.type === 'folder' ? i.folder.name : i.doc.name)

function triggerDownload(name: string, mime: string, data: Uint8Array) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Kind = 'files' | 'images'

export function LibraryPage() {
  return <LibraryRoute kind="files" />
}

export function ImagesPage() {
  return <LibraryRoute kind="images" />
}

function LibraryRoute({ kind }: { kind: Kind }) {
  const { view } = useParams()
  const base = kind === 'images' ? '/images' : '/documents'
  const allowed = kind === 'images' ? ['all', 'recent', 'trash'] : VIEWS
  if (!(allowed as readonly string[]).includes(view ?? '')) return <Navigate to={`${base}/all`} replace />
  return <Library view={view as LibraryView} kind={kind} />
}

function Library({ view, kind }: { view: LibraryView; kind: Kind }) {
  const base = kind === 'images' ? '/images' : '/documents'
  const tabViews = (kind === 'images' ? ['all', 'recent'] : ['all', 'recent', 'favorites']) as ('all' | 'recent' | 'favorites')[]
  const { t, i18n } = useTranslation()
  const repo = useRepository()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const folderId = view === 'all' ? (params.get('folder') ?? null) : null
  const fileInput = useRef<HTMLInputElement>(null)

  const [docs, setDocs] = useState<DocumentRecord[]>([])
  const [folders, setFolders] = useState<FolderRecord[]>([])
  const [path, setPath] = useState<FolderRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [version, setVersion] = useState(0)
  const [sort, setSort] = useState<Sort>('updated')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [messages, setMessages] = useState<{ kind: 'error' | 'info'; text: string; link?: { to: string; label: string } }[]>([])
  const [dragging, setDragging] = useState(false)

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let alive = true
    void (async () => {
      const [d, f, p] = await Promise.all([
        repo.listDocuments({ view, folderId, query: q, kind }),
        view === 'all' ? repo.listFolders(folderId, q) : Promise.resolve([] as FolderRecord[]),
        view === 'all' && !q ? repo.folderPath(folderId) : Promise.resolve([] as FolderRecord[]),
      ])
      if (!alive) return
      setDocs(d)
      setFolders(f)
      setPath(p)
      setSelected(new Set())
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [repo, view, folderId, q, version, kind])

  const items: Item[] = useMemo(() => {
    const cmp = new Intl.Collator(i18n.language)
    const sortedDocs = [...docs]
    if (sort === 'name') sortedDocs.sort((a, b) => cmp.compare(a.name, b.name))
    if (sort === 'size') sortedDocs.sort((a, b) => b.size - a.size)
    return [
      ...folders.map((folder) => ({ type: 'folder', folder }) as Item),
      ...sortedDocs.map((doc) => ({ type: 'doc', doc }) as Item),
    ]
  }, [docs, folders, sort, i18n.language])

  const trash = view === 'trash'
  const picked = items.filter((i) => selected.has(itemKey(i)))

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language],
  )

  const upload = async (list: FileList | File[]) => {
    const all = [...list]
    if (!all.length) return
    // Thư viện Hình ảnh chỉ nhận ảnh; tệp khác được báo riêng thay vì rơi vào chỗ không nhìn thấy.
    const files = kind === 'images' ? all.filter((f) => detectMime(f.name, f.type).startsWith('image/')) : all
    const rejected = all.filter((f) => !files.includes(f))
    setMessages([])
    setBusy({ done: 0, total: files.length })
    const res = await uploadFiles(repo, files, folderId, (done, total) => setBusy({ done, total }))
    setBusy(null)
    const out: { kind: 'error' | 'info'; text: string; link?: { to: string; label: string } }[] = []
    if (res.added) out.push({ kind: 'info', text: t('library.uploaded', { count: res.added }) })
    if (kind === 'files' && res.images > 0) {
      out.push({ kind: 'info', text: t('library.imagesMoved', { count: res.images }), link: { to: '/images/all', label: t('library.openImages') } })
    }
    for (const f of rejected) {
      out.push({ kind: 'error', text: t('library.uploadFailed', { name: f.name, reason: t('library.reasonNotImage') }) })
    }
    for (const f of res.failed) {
      const reason = t(f.reason === 'invalid-pdf' ? 'library.reasonInvalidPdf' : f.reason === 'quota' ? 'library.reasonQuota' : 'library.reasonUnknown')
      out.push({ kind: 'error', text: t('library.uploadFailed', { name: f.name, reason }) + (f.reason === 'unknown' && f.detail ? ` (${f.detail})` : '') })
    }
    setMessages(out)
    reload()
  }

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const remove = async (list: Item[]) => {
    for (const i of list) {
      if (i.type === 'folder') await repo.softDeleteFolder(i.folder.id)
      else await repo.softDeleteDocument(i.doc.id)
    }
    reload()
  }

  const downloadDoc = async (d: DocumentRecord) => triggerDownload(d.name, d.mime, await repo.getBytes(d.id))

  const openFolder = (id: string | null) => {
    const next = new URLSearchParams(params)
    next.delete('q')
    if (id) next.set('folder', id)
    else next.delete('folder')
    setParams(next)
  }

  const submitFolder = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
    if (!name) return
    await repo.createFolder(name, folderId)
    setDialog(null)
    reload()
  }

  const submitRename = async (e: FormEvent<HTMLFormElement>, item: Item) => {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
    if (!name) return
    if (item.type === 'folder') await repo.renameFolder(item.folder.id, name)
    else await repo.renameDocument(item.doc.id, name)
    setDialog(null)
    reload()
  }

  const title = trash ? t('nav.trash') : view === 'all' ? (path.at(-1)?.name ?? t(kind === 'images' ? 'library.imagesRoot' : 'library.root')) : t(`nav.${view}`)

  return (
    <div
      onDragOver={(e) => {
        if (trash || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        if (trash) return
        e.preventDefault()
        setDragging(false)
        void upload(e.dataTransfer.files)
      }}
      className={dragging ? 'rounded-[var(--r-lg)] outline-2 outline-dashed outline-[var(--action)]' : undefined}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          {view === 'all' && !q ? (
            <nav aria-label={t('library.breadcrumb')} className="flex flex-wrap items-center gap-1 text-muted">
              <button type="button" className="min-h-11 hover:text-ink" onClick={() => openFolder(null)}>
                {t('library.title')}
              </button>
              {path.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1">
                  <span aria-hidden>/</span>
                  {i < path.length - 1 ? (
                    <button type="button" className="min-h-11 hover:text-ink" onClick={() => openFolder(f.id)}>
                      {f.name}
                    </button>
                  ) : null}
                </span>
              ))}
            </nav>
          ) : (
            <p className="text-muted">{t('library.title')}</p>
          )}
          <h1 className="page-title">{q ? `“${q}”` : title}</h1>
        </div>
        {trash ? (
          <button type="button" className="btn" disabled={docs.length === 0} onClick={() => setDialog({ kind: 'emptyTrash' })}>
            <Trash2 aria-hidden size={18} />
            {t('library.emptyTrash')}
          </button>
        ) : (
          <>
            {view === 'all' && (
              <button type="button" className="btn" onClick={() => setDialog({ kind: 'folder' })}>
                <FolderPlus aria-hidden size={18} />
                {t('library.newFolder')}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden size={18} />
              {t('library.upload')}
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={kind === 'images' ? 'image/*' : undefined}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                if (e.target.files) void upload(e.target.files)
                e.target.value = ''
              }}
            />
          </>
        )}
      </div>

      {view !== 'trash' && view !== 'recent' && (
        <nav aria-label={t('library.title')} className="mt-4 flex items-center gap-2 border-b border-line">
          {tabViews.map((v) => (
            <NavLink key={v} to={`${base}/${v}`} className="tab">
              {t(`nav.${v}`)}
            </NavLink>
          ))}
          <span className="ml-auto flex items-center gap-2 pb-1">
            <label htmlFor="sort" className="sr-only">
              {t('library.sort')}
            </label>
            <select id="sort" className="field-input" style={{ minHeight: 40, width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="updated">{t('library.sortUpdated')}</option>
              <option value="name">{t('library.sortName')}</option>
              <option value="size">{t('library.sortSize')}</option>
            </select>
          </span>
        </nav>
      )}
      {view === 'recent' && (
        <nav aria-label={t('library.title')} className="mt-4 flex gap-2 border-b border-line">
          {tabViews.map((v) => (
            <NavLink key={v} to={`${base}/${v}`} className="tab">
              {t(`nav.${v}`)}
            </NavLink>
          ))}
        </nav>
      )}

      <div role="status" aria-live="polite" className="mt-4 grid gap-2">
        {busy && <p className="notice">{t('library.uploading', busy)}</p>}
        {messages.map((m, i) => (
          <p key={i} className={`notice ${m.kind === 'error' ? 'notice-error' : ''}`} role={m.kind === 'error' ? 'alert' : undefined}>
            {m.text}
            {m.link && (
              <>
                {' '}
                <Link to={m.link.to} className="font-medium underline">
                  {m.link.label}
                </Link>
              </>
            )}
          </p>
        ))}
      </div>

      {picked.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[var(--r-md)] border border-line bg-surface p-3">
          <span className="font-medium">{t('library.selected', { count: picked.length })}</span>
          {trash ? (
            <>
              <button type="button" className="btn" onClick={() => void Promise.all(picked.map((i) => i.type === 'doc' && repo.restoreDocument(i.doc.id))).then(reload)}>
                <RotateCcw aria-hidden size={18} />
                {t('library.restoreAction')}
              </button>
              <button type="button" className="btn" onClick={() => setDialog({ kind: 'purge', items: picked.flatMap((i) => (i.type === 'doc' ? [i.doc] : [])) })}>
                <Trash2 aria-hidden size={18} />
                {t('library.confirm')}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => setDialog({ kind: 'move', items: picked })}>
                <FolderInput aria-hidden size={18} />
                {t('library.move')}
              </button>
              <button type="button" className="btn" onClick={() => void remove(picked)}>
                <Trash2 aria-hidden size={18} />
                {t('library.deleteAction')}
              </button>
            </>
          )}
          <button type="button" className="btn" onClick={() => setSelected(new Set())}>
            {t('library.clearSelection')}
          </button>
        </div>
      )}

      {loaded && items.length === 0 ? (
        <EmptyState view={view} q={q} inFolder={folderId !== null} kind={kind} />
      ) : (
        <ul className="mt-2">
          {items.map((item) => {
            const key = itemKey(item)
            const name = itemName(item)
            const doc = item.type === 'doc' ? item.doc : null
            const Icon = item.type === 'folder' ? FolderIcon : doc?.mime.startsWith('image/') ? ImageIcon : FileText
            const modified = item.type === 'folder' ? item.folder.updatedAt : item.doc.updatedAt
            return (
              <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--action)]"
                  aria-label={t('library.selectItem', { name })}
                  checked={selected.has(key)}
                  onChange={() => toggle(key)}
                />
                <Icon aria-hidden size={22} className="text-action" />
                <div className="min-w-0 flex-1 basis-40">
                  {item.type === 'folder' ? (
                    <button type="button" className="block min-h-11 max-w-full truncate text-left font-medium hover:underline" onClick={() => openFolder(item.folder.id)}>
                      {name}
                    </button>
                  ) : (
                    <button type="button" className="block min-h-11 max-w-full truncate text-left font-medium hover:underline" aria-label={t('library.preview', { name })} onClick={() => setDialog({ kind: 'preview', doc: item.doc })}>
                      {name}
                    </button>
                  )}
                </div>
                <p className="w-24 text-sm text-muted">{doc ? formatBytes(doc.size) : ''}</p>
                <p className="w-20 text-sm text-muted">{doc?.pageCount != null ? t('library.pages', { count: doc.pageCount }) : ''}</p>
                <p className="w-40 text-sm text-muted">{dateFmt.format(modified)}</p>
                <div className="ml-auto flex items-center">
                  {trash && doc ? (
                    <>
                      <IconButton label={t('library.restore', { name })} onClick={() => void repo.restoreDocument(doc.id).then(reload)}>
                        <RotateCcw aria-hidden size={18} />
                      </IconButton>
                      <IconButton label={t('library.deleteForever', { name })} onClick={() => setDialog({ kind: 'purge', items: [doc] })}>
                        <Trash2 aria-hidden size={18} />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      {doc && kind === 'files' && (
                        <IconButton
                          label={t(doc.favorite ? 'library.unfavorite' : 'library.favorite', { name })}
                          pressed={doc.favorite}
                          onClick={() => void repo.setFavorite(doc.id, !doc.favorite).then(reload)}
                        >
                          <Star aria-hidden size={18} fill={doc.favorite ? 'currentColor' : 'none'} />
                        </IconButton>
                      )}
                      {doc && (
                        <IconButton label={t('library.download', { name })} onClick={() => void downloadDoc(doc)}>
                          <Download aria-hidden size={18} />
                        </IconButton>
                      )}
                      <IconButton label={`${t('library.rename')}: ${name}`} onClick={() => setDialog({ kind: 'rename', item })}>
                        <Pencil aria-hidden size={18} />
                      </IconButton>
                      <IconButton label={`${t('library.move')}: ${name}`} onClick={() => setDialog({ kind: 'move', items: [item] })}>
                        <FolderInput aria-hidden size={18} />
                      </IconButton>
                      <IconButton label={t('library.delete', { name })} onClick={() => void remove([item])}>
                        <Trash2 aria-hidden size={18} />
                      </IconButton>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal open={dialog?.kind === 'preview'} wide title={dialog?.kind === 'preview' ? dialog.doc.name : ''} onClose={() => setDialog(null)}>
        {dialog?.kind === 'preview' && (
          <div>
            <DocPreview doc={dialog.doc} />
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" className="btn" onClick={() => void downloadDoc(dialog.doc)}>{t('library.downloadShort')}</button>
              <button type="button" className="btn btn-primary" onClick={() => setDialog(null)}>{t('library.close')}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={dialog?.kind === 'folder'} title={t('library.newFolder')} onClose={() => setDialog(null)}>
        <form onSubmit={(e) => void submitFolder(e)}>
          <label htmlFor="folder-name" className="field-label">
            {t('library.folderName')}
          </label>
          <input id="folder-name" name="name" className="field-input" autoFocus required />
          <FormButtons submit={t('library.create')} cancel={t('library.cancel')} onCancel={() => setDialog(null)} />
        </form>
      </Modal>

      <Modal open={dialog?.kind === 'rename'} title={t('library.renameTitle')} onClose={() => setDialog(null)}>
        {dialog?.kind === 'rename' && (
          <form onSubmit={(e) => void submitRename(e, dialog.item)}>
            <label htmlFor="new-name" className="field-label">
              {t('library.newName')}
            </label>
            <input id="new-name" name="name" className="field-input" defaultValue={itemName(dialog.item)} autoFocus required />
            <FormButtons submit={t('library.save')} cancel={t('library.cancel')} onCancel={() => setDialog(null)} />
          </form>
        )}
      </Modal>

      <Modal open={dialog?.kind === 'move'} title={t('library.moveTitle')} onClose={() => setDialog(null)}>
        {dialog?.kind === 'move' && (
          <MovePicker
            items={dialog.items}
            onCancel={() => setDialog(null)}
            onMove={async (target) => {
              for (const i of dialog.items) {
                if (i.type === 'folder') await repo.moveFolder(i.folder.id, target).catch(() => undefined)
                else await repo.moveDocument(i.doc.id, target)
              }
              setDialog(null)
              reload()
            }}
          />
        )}
      </Modal>

      <Modal
        open={dialog?.kind === 'purge' || dialog?.kind === 'emptyTrash'}
        title={t('library.confirm')}
        onClose={() => setDialog(null)}
      >
        {(dialog?.kind === 'purge' || dialog?.kind === 'emptyTrash') && (
          <div>
            <p>
              {dialog.kind === 'emptyTrash'
                ? t('library.emptyTrashConfirm')
                : t('library.deleteForeverConfirm', { name: dialog.items.length === 1 ? dialog.items[0]!.name : `${dialog.items.length}` })}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="btn" onClick={() => setDialog(null)}>
                {t('library.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const run = dialog.kind === 'emptyTrash' ? repo.emptyTrash() : Promise.all(dialog.items.map((d) => repo.purgeDocument(d.id)))
                  void run.then(() => {
                    setDialog(null)
                    reload()
                  })
                }}
              >
                {t('library.confirm')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function IconButton({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean }) {
  return (
    <button type="button" className="btn btn-icon border-transparent bg-transparent" aria-label={label} aria-pressed={pressed} title={label} onClick={onClick}>
      {children}
    </button>
  )
}

function FormButtons({ submit, cancel, onCancel }: { submit: string; cancel: string; onCancel: () => void }) {
  return (
    <div className="mt-6 flex justify-end gap-3">
      <button type="button" className="btn" onClick={onCancel}>
        {cancel}
      </button>
      <button type="submit" className="btn btn-primary">
        {submit}
      </button>
    </div>
  )
}

function MovePicker({ items, onMove, onCancel }: { items: Item[]; onMove: (target: string | null) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const repo = useRepository()
  const [tree, setTree] = useState<{ folder: FolderRecord; path: string }[]>([])
  const [target, setTarget] = useState<string | null>(null)
  useEffect(() => {
    void repo.listFolderTree().then(setTree)
  }, [repo])
  // Không cho chọn chính nó làm đích; đích là con cháu sẽ bị repository từ chối.
  const movingFolders = new Set(items.flatMap((i) => (i.type === 'folder' ? [i.folder.id] : [])))
  return (
    <div>
      <fieldset>
        <legend className="sr-only">{t('library.moveTitle')}</legend>
        <ul className="max-h-72 overflow-auto">
          {[{ id: null as string | null, label: t('library.rootFolder') }, ...tree.filter((x) => !movingFolders.has(x.folder.id)).map((x) => ({ id: x.folder.id as string | null, label: x.path }))].map((o) => (
            <li key={o.id ?? 'root'}>
              <label className="flex min-h-11 items-center gap-3">
                <input type="radio" name="target" className="size-5 accent-[var(--action)]" checked={target === o.id} onChange={() => setTarget(o.id)} />
                <FolderIcon aria-hidden size={18} className="text-action" />
                <span className="truncate">{o.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="btn" onClick={onCancel}>
          {t('library.cancel')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onMove(target)}>
          {t('library.moveHere')}
        </button>
      </div>
    </div>
  )
}

function EmptyState({ view, q, inFolder, kind }: { view: LibraryView; q: string; inFolder: boolean; kind: Kind }) {
  const { t } = useTranslation()
  const trash = view === 'trash'
  const title = q ? t('library.noResults', { q }) : trash ? t('library.trashEmptyTitle') : inFolder ? t('library.emptyFolder') : t(kind === 'images' ? 'library.imagesEmptyTitle' : 'library.emptyTitle')
  const hint = q ? '' : trash ? t('library.trashEmptyHint') : t(kind === 'images' ? 'library.imagesEmptyHint' : 'library.emptyHint')
  return (
    <div className="flex flex-col items-center gap-2 py-24 text-center">
      <Files aria-hidden size={48} className="text-muted" />
      <h2 className="section-title">{title}</h2>
      {hint && <p className="text-muted">{hint}</p>}
      {!trash && !q && (
        <Link to="/tools" className="link mt-2 inline-flex min-h-11 items-center text-action underline">
          {t('library.openWithTools')}
        </Link>
      )}
    </div>
  )
}
