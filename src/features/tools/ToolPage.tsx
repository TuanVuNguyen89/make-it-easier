import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowLeft, ArrowUp, Download, FolderOpen, Upload, X } from 'lucide-react'
import { getTool } from '@/tools/registry'
import { ToolError, type ParamDef, type ToolMeta, type ToolOutput } from '@/tools/types'
import { runTool } from '@/workers/runTool'
import { readPageCount } from '@/lib/pageCount'
import { formatBytes } from '@/lib/format'
import { useRepository } from '@/storage/RepositoryProvider'
import { StorageQuotaError } from '@/storage/types'
import { zipSync } from 'fflate'
import { ParamField } from './ParamField'
import { PageEditor } from './PageEditor'
import { clearHandoff, peekHandoff } from './handoff'
import { ImageCropEditor, ImageMaskEditor } from './ImageEditors'

// Trình chỉnh PDF nặng (pdf.js, SVG, chữ ký): chỉ nạp khi mở công cụ chú thích/chỉnh sửa/ký.
const PdfEditor = lazy(() => import('../editor/PdfEditor'))
import { LibraryPicker } from './LibraryPicker'

interface FileItem {
  key: string
  name: string
  bytes: Uint8Array
}

const LARGE = 100 * 1024 * 1024
let seq = 0
const nextKey = () => `f${++seq}`

function defaults(params: ParamDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const p of params) {
    if (p.type === 'boolean' || p.type === 'number' || p.type === 'select') out[p.key] = p.default
    else out[p.key] = ('default' in p && p.default) || ''
  }
  return out
}

function extOf(name: string) {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i) : ''
}

function download(name: string, mime: string, data: Uint8Array) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Phase = 'idle' | 'running' | 'done'

export function ToolPage() {
  const { toolId = '' } = useParams()
  const { t } = useTranslation()
  const tool = getTool(toolId)
  if (!tool) {
    return (
      <div>
        <p role="alert">{t('errors.notFoundTool')}</p>
        <Link to="/tools" className="btn mt-4">
          {t('toolPage.back')}
        </Link>
      </div>
    )
  }
  // key theo công cụ: đổi công cụ thì toàn bộ state của form được tạo mới.
  return <ToolForm key={tool.id} tool={tool} />
}

function ToolForm({ tool }: { tool: ToolMeta }) {
  const { t } = useTranslation()
  const repo = useRepository()
  const fileInput = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)

  // Tệp chuyển từ trang "Chuyển đổi PDF": chỉ nhận những tệp công cụ này chấp nhận.
  const [files, setFiles] = useState<FileItem[]>(() =>
    peekHandoff()
      .filter((f) => tool.inputs.extensions.includes(extOf(f.name).toLowerCase()))
      .slice(0, tool.inputs.max)
      .map((f) => ({ key: nextKey(), name: f.name, bytes: f.bytes })),
  )
  useEffect(() => clearHandoff, [])
  const [values, setValues] = useState<Record<string, unknown>>(() => defaults(tool.params))
  const [resultName, setResultName] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [outputs, setOutputs] = useState<ToolOutput[]>([])
  const [saved, setSaved] = useState<Set<number>>(new Set())
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string; link?: { to: string; label: string } } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [ranBytes, setRanBytes] = useState(0)
  const [editor, setEditor] = useState<{ key: string | undefined; options: Record<string, unknown> }>({ key: undefined, options: {} })

  useEffect(() => () => abort.current?.abort(), [])

  const large = useMemo(() => files.some((f) => f.bytes.byteLength > LARGE), [files])

  const { inputs } = tool
  const Icon = tool.icon
  const running = phase === 'running'
  // Tùy chọn của trình chỉnh chỉ có hiệu lực cho đúng tệp đang chọn (đổi/bỏ tệp thì bỏ).
  const editorOptions = editor.key === files[0]?.key ? editor.options : {}
  const setEditorOptions = (options: Record<string, unknown>) => setEditor({ key: files[0]?.key, options })
  const needsPaint = tool.editor === 'image-mask' && !editorOptions.mask
  const isPdfEditor = tool.editor?.startsWith('pdf-') === true
  const needsMarks = isPdfEditor && !(Array.isArray(editorOptions.annotations) && editorOptions.annotations.length > 0)
  const missing = inputs.min - files.length
  const tooMany = files.length > inputs.max
  const blockReason = tooMany
    ? t('toolPage.tooMany', { count: inputs.max })
    : missing > 0
      ? t('toolPage.needAtLeast', { count: inputs.min })
      : needsPaint
        ? t('toolPage.paintFirst')
        : needsMarks
          ? t('toolPage.addSomething')
          : null

  const addDeviceFiles = async (list: FileList | File[]) => {
    const all = [...list]
    const ok = all.filter((f) => inputs.extensions.includes(extOf(f.name).toLowerCase()))
    // Đọc từng tệp riêng: tệp không đọc được (đang bị khóa, ở ổ mạng/đám mây chưa tải) được báo rõ thay vì im lặng.
    const items: FileItem[] = []
    const unreadable: string[] = []
    for (const f of ok) {
      try {
        items.push({ key: nextKey(), name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
      } catch (e) {
        unreadable.push(`${f.name} (${e instanceof Error ? e.message : String(e)})`)
      }
    }
    setFiles((prev) => [...prev, ...items])
    const rejected = all.length - ok.length
    setMessage(
      unreadable.length
        ? { kind: 'error', text: t('toolPage.unreadable', { files: unreadable.join(', ') }) }
        : rejected
          ? { kind: 'info', text: t('toolPage.rejected', { count: rejected }) }
          : null,
    )
  }

  const addLibraryFiles = async (ids: string[]) => {
    setPickerOpen(false)
    const items: FileItem[] = []
    for (const id of ids) {
      const doc = await repo.getDocument(id)
      if (doc) items.push({ key: nextKey(), name: doc.name, bytes: await repo.getBytes(id) })
    }
    setFiles((prev) => [...prev, ...items])
  }

  const move = (i: number, d: -1 | 1) =>
    setFiles((prev) => {
      const j = i + d
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {}
    for (const p of tool.params) {
      const v = values[p.key]
      if (p.required && !String(v ?? '').trim()) {
        errs[p.key] = t('errors.required', { field: t(p.labelKey).toLowerCase() })
      } else if (p.mustMatch && v !== values[p.mustMatch]) {
        errs[p.key] = t('errors.mismatch')
      }
    }
    return errs
  }

  const showError = (e: unknown) => {
    if (e instanceof ToolError && e.code === 'aborted') {
      setMessage({ kind: 'info', text: t('toolPage.cancelled') })
    } else if (e instanceof ToolError && (e.code === 'no-reduction' || e.code === 'no-text')) {
      setMessage({ kind: 'info', text: t(`errors.${e.code}`) })
    } else {
      const code = e instanceof ToolError ? e.code : 'unknown'
      // PDF có mật khẩu: dẫn người dùng tới công cụ Mở khóa (trừ khi đang ở chính công cụ đó).
      const link =
        code === 'encrypted' && tool.id !== 'unlock'
          ? { to: '/tools/unlock', label: t('tools.unlock.name') }
          : code === 'no-text-layer'
            ? { to: '/tools/ocr', label: t('tools.ocr.name') } // PDF quét: cần OCR trước
            : undefined
      setMessage({ kind: 'error', text: t(`errors.${code}`), link })
    }
  }

  const run = async () => {
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      // Trường lỗi đầu tiên nhận focus (sau khi aria-invalid được vẽ ra).
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    setRanBytes(files.reduce((n, f) => n + f.bytes.byteLength, 0))
    const ac = new AbortController()
    abort.current = ac
    setPhase('running')
    setProgress(0)
    setMessage(null)
    setOutputs([])
    setSaved(new Set())
    try {
      const res = await runTool(
        tool.id,
        files.map((f) => f.bytes),
        { ...values, ...editorOptions },
        { onProgress: setProgress, signal: ac.signal, names: files.map((f) => f.name) },
      )
      setOutputs(res)
      setPhase('done')
    } catch (e) {
      setPhase('idle')
      showError(e)
    } finally {
      abort.current = null
    }
  }

  /**
   * "Áp dụng thay đổi" của trình chỉnh: đưa các thay đổi đang chờ vào tài liệu đang làm việc (kết quả trở thành tài liệu
   * nền để sửa tiếp, có thể tải về/lưu vào thư viện ngay). Khác với nút chạy cuối trang, nó không kết thúc phiên sửa.
   */
  const applyNow = async (annotations: unknown[]) => {
    const file = files[0]
    if (!file) return
    const ac = new AbortController()
    abort.current = ac
    setPhase('running')
    setProgress(0)
    setMessage(null)
    try {
      const [out] = await runTool(tool.id, [file.bytes], { annotations }, { onProgress: setProgress, signal: ac.signal, names: [file.name] })
      if (!out) throw new Error('No output')
      setFiles([{ key: nextKey(), name: file.name, bytes: out.data }]) // khóa mới: trình chỉnh dựng lại trên tài liệu đã áp dụng
      setOutputs([out])
      setSaved(new Set())
      setRanBytes(file.bytes.byteLength)
      setPhase('done')
    } catch (e) {
      setPhase('idle')
      showError(e)
    } finally {
      abort.current = null
    }
  }

  const finalName = (o: ToolOutput) => {
    const custom = resultName.trim()
    if (outputs.length !== 1 || !custom) return o.name
    const ext = extOf(o.name)
    return custom.toLowerCase().endsWith(ext.toLowerCase()) ? custom : custom + ext
  }

  const save = async (i: number) => {
    const o = outputs[i]!
    try {
      await repo.createDocument({
        name: finalName(o),
        mime: o.mime,
        data: o.data,
        pageCount: o.mime === 'application/pdf' ? await readPageCount(o.data) : null,
      })
      setSaved((prev) => new Set(prev).add(i))
      setMessage(null)
    } catch (e) {
      setMessage({ kind: 'error', text: t(e instanceof StorageQuotaError ? 'errors.quota' : 'errors.unknown') })
    }
  }

  const saveAll = async () => {
    for (let i = 0; i < outputs.length; i++) if (!saved.has(i)) await save(i)
  }
  const downloadZip = () => {
    const files: Record<string, Uint8Array> = {}
    for (const o of outputs) files[o.name] = o.data
    download('files.zip', 'application/zip', zipSync(files))
  }

  return (
    <div className={isPdfEditor ? 'max-w-6xl [&>*:not([data-wide])]:max-w-3xl' : 'max-w-3xl'}>
      <Link to={tool.kind === 'image' ? '/tools/images' : '/tools'} className="inline-flex min-h-11 items-center gap-2 text-muted hover:text-ink">
        <ArrowLeft aria-hidden size={18} />
        {t('toolPage.back')}
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <Icon aria-hidden size={32} className="text-action" />
        <h1 className="page-title">{t(`tools.${tool.id}.name`)}</h1>
      </div>
      <p className="mt-2 max-w-[62ch] text-muted">{t(`tools.${tool.id}.desc`)}</p>

      <section className="mt-6" aria-labelledby="files-h">
        <h2 id="files-h" className="section-title">
          {t('toolPage.files')}
        </h2>
        <div
          className={`mt-3 rounded-[var(--r-lg)] border border-dashed p-5 ${dragging ? 'border-action bg-[rgb(15_111_106/0.06)]' : 'border-line'}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void addDeviceFiles(e.dataTransfer.files)
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn" disabled={running} onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden size={18} />
              {t('toolPage.addFromDevice')}
            </button>
            <button type="button" className="btn" disabled={running} onClick={() => setPickerOpen(true)}>
              <FolderOpen aria-hidden size={18} />
              {t('toolPage.addFromLibrary')}
            </button>
            <span className="text-muted">{t('toolPage.dropHint')}</span>
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple={inputs.max > 1}
            accept={inputs.extensions.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              if (e.target.files) void addDeviceFiles(e.target.files)
              e.target.value = ''
            }}
          />
          {files.length === 0 ? (
            <p className="mt-4 text-muted">{t('toolPage.noFiles')}</p>
          ) : (
            <ol className="mt-4">
              {files.map((f, i) => (
                <li key={f.key} className="flex min-h-11 flex-wrap items-center gap-2 border-t border-line py-2 first:border-t-0">
                  <span className="min-w-0 basis-full break-all sm:basis-0 sm:flex-1 sm:truncate">
                    {inputs.ordered && <span className="mr-2 text-muted tabular-nums">{i + 1}.</span>}
                    {f.name}
                  </span>
                  <span className="mr-auto text-sm text-muted sm:mr-0">{formatBytes(f.bytes.byteLength)}</span>
                  {inputs.ordered && (
                    <>
                      <button
                        type="button"
                        className="btn btn-icon"
                        disabled={running || i === 0}
                        aria-label={t('toolPage.moveUp', { name: f.name })}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp aria-hidden size={18} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-icon"
                        disabled={running || i === files.length - 1}
                        aria-label={t('toolPage.moveDown', { name: f.name })}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown aria-hidden size={18} />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn-icon"
                    disabled={running}
                    aria-label={t('toolPage.remove', { name: f.name })}
                    onClick={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}
                  >
                    <X aria-hidden size={18} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
        {large && <p className="notice mt-3">{t('toolPage.largeWarning')}</p>}
      </section>

      {tool.editor === 'pages' && files[0] && (
        <section className="mt-6" aria-label={t('editor.hint')}>
          <p className="mb-3 text-muted">{t('editor.hint')}</p>
          <PageEditor key={files[0].key} bytes={files[0].bytes} onChange={(pages) => setEditorOptions({ pages })} />
        </section>
      )}

      {isPdfEditor && files[0] && (
        <section data-wide className="mt-6" aria-label={t('editor.toolbar')}>
          <Suspense fallback={<p className="text-muted">…</p>}>
            <PdfEditor key={files[0].key} bytes={files[0].bytes} mode={tool.editor!.slice(4) as 'annotate' | 'edit' | 'sign' | 'redact'} onChange={(annotations) => setEditorOptions({ annotations })} onApply={applyNow} busy={running} />
          </Suspense>
        </section>
      )}
      {tool.editor === 'image-crop' && files[0] && (
        <section className="mt-6" aria-label={t('imageEditor.cropHint')}>
          <ImageCropEditor key={files[0].key} bytes={files[0].bytes} onChange={(o) => setEditorOptions({ ...o })} />
        </section>
      )}
      {tool.editor === 'image-mask' && files[0] && (
        <section className="mt-6" aria-label={t('imageEditor.maskHint')}>
          <ImageMaskEditor key={files[0].key} bytes={files[0].bytes} onChange={setEditorOptions} />
        </section>
      )}

      {tool.params.length > 0 && (
        <section className="mt-6 grid gap-4">
          {tool.params.map((p) => (
            <ParamField
              key={p.key}
              def={p}
              value={values[p.key]}
              error={fieldErrors[p.key]}
              onChange={(v) => {
                setValues((prev) => ({ ...prev, [p.key]: v }))
                const dependents = tool.params.filter((x) => x.mustMatch === p.key).map((x) => x.key)
                setFieldErrors((prev) => {
                  const next = { ...prev }
                  for (const k of [p.key, ...dependents]) delete next[k]
                  return next
                })
              }}
            />
          ))}
        </section>
      )}

      <div className="mt-6">
        <label htmlFor="result-name" className="field-label">
          {t('toolPage.resultName')}
        </label>
        <input
          id="result-name"
          className="field-input"
          value={resultName}
          aria-describedby="result-name-hint"
          onChange={(e) => setResultName(e.target.value)}
        />
        <p id="result-name-hint" className="field-hint">
          {t('toolPage.resultNameHint')}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {running ? (
          <button type="button" className="btn" onClick={() => abort.current?.abort()}>
            {t('toolPage.cancel')}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={blockReason !== null} onClick={() => void run()}>
            {t(`tools.${tool.id}.action`)}
          </button>
        )}
        {!running && blockReason && <span className="text-muted">{blockReason}</span>}
      </div>

      <div role="status" aria-live="polite" className="mt-4">
        {running && (
          <div>
            <p>{t('toolPage.running', { percent: Math.round(progress * 100) })}</p>
            <div className="progress mt-2" aria-hidden>
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        )}
        {message && (
          <p className={`notice ${message.kind === 'error' ? 'notice-error' : ''}`} role={message.kind === 'error' ? 'alert' : undefined}>
            {message.text}
            {message.link && (
              <>
                {' '}
                <Link to={message.link.to} className="font-medium underline">
                  {message.link.label}
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      {phase === 'done' && outputs.length > 0 && (
        <section className="mt-6" aria-labelledby="result-h">
          <h2 id="result-h" className="section-title">
            {t('toolPage.resultTitle')}
          </h2>
          {[...new Set(outputs.flatMap((o) => o.warnings ?? []))].map((w) => (
            <p key={w} role="status" className="notice mt-3">
              {t(`warnings.${w}`)}
            </p>
          ))}
          {tool.showSizeDelta && outputs.length === 1 && ranBytes > 0 && (
            <p className="mt-3 font-medium">
              {t('toolPage.sizeDelta', {
                before: formatBytes(ranBytes),
                after: formatBytes(outputs[0]!.data.byteLength),
                percent: Math.round((1 - outputs[0]!.data.byteLength / ranBytes) * 100),
              })}
            </p>
          )}
          {outputs.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={downloadZip}>
                <Download aria-hidden size={18} />
                {t('toolPage.downloadAll')}
              </button>
              <button type="button" className="btn" disabled={saved.size === outputs.length} onClick={() => void saveAll()}>
                {saved.size === outputs.length ? t('toolPage.savedAll') : t('toolPage.saveAll')}
              </button>
            </div>
          )}
          <ul className="mt-3">
            {outputs.map((o, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-t-0">
                <span className="min-w-0 flex-1 truncate font-medium">{finalName(o)}</span>
                <span className="text-sm text-muted">{formatBytes(o.data.byteLength)}</span>
                <button type="button" className="btn" disabled={saved.has(i)} onClick={() => void save(i)}>
                  {saved.has(i) ? t('toolPage.saved') : t('toolPage.saveToLibrary')}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => download(finalName(o), o.mime, o.data)}>
                  <Download aria-hidden size={18} />
                  {t('toolPage.download')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <LibraryPicker open={pickerOpen} mimes={inputs.mimes} onAdd={(ids) => void addLibraryFiles(ids)} onClose={() => setPickerOpen(false)} />
    </div>
  )
}
