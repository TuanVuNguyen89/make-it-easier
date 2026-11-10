import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FolderOpen, RefreshCw, RotateCw } from 'lucide-react'
import type { UpdateStatus } from '@/storage/desktopStore'

type Info = { version: string; dataDir: string; packaged: boolean; platform: string }

export function SettingsPage() {
  const { t } = useTranslation()
  const desktop = typeof window !== 'undefined' ? window.desktop : undefined
  const [info, setInfo] = useState<Info | null>(null)
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    if (!desktop?.update) return
    void desktop.info?.().then(setInfo)
    void desktop.update.status().then(setStatus)
    return desktop.update.onStatus(setStatus)
  }, [desktop])

  const up = desktop?.update
  const mac = info?.platform === 'darwin'

  const message = (() => {
    switch (status.state) {
      case 'checking': return t('settings.checking')
      case 'none': return t('settings.upToDate')
      case 'available': return t('settings.available', { version: status.version })
      case 'downloading': return t('settings.downloading', { version: status.version, percent: status.percent ?? 0 })
      case 'ready': return t('settings.ready', { version: status.version })
      case 'unsupported': return t('settings.unsupported')
      case 'error': return t('settings.error', { message: status.error })
      default: return ''
    }
  })()

  return (
    <div className="max-w-2xl">
      <h1 className="page-title">{t('settings.title')}</h1>

      <section className="mt-6 rounded-[var(--r-md)] border border-line bg-surface p-4" aria-labelledby="set-version">
        <h2 id="set-version" className="section-title">{t('settings.version')}</h2>
        {desktop && up ? (
          <>
            <p className="mt-2">{t('settings.current', { version: info?.version ?? '…' })}</p>
            <p className="mt-2 min-h-6 text-muted" role="status" aria-live="polite">{message}</p>
            {status.state === 'downloading' && <progress className="mt-2 w-full" max={100} value={status.percent ?? 0} aria-label={t('settings.downloadingLabel')} />}
            <div className="mt-4 flex flex-wrap gap-3">
              {status.state === 'ready' ? (
                <button type="button" className="btn btn-primary" onClick={() => void up.install()}>
                  <RotateCw aria-hidden size={18} />
                  {t('settings.restartInstall')}
                </button>
              ) : status.state === 'available' ? (
                <button type="button" className="btn btn-primary" onClick={() => void up.download()}>
                  <Download aria-hidden size={18} />
                  {t(mac ? 'settings.openDownloadPage' : 'settings.upgrade', { version: status.version })}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" disabled={status.state === 'checking' || status.state === 'downloading' || status.state === 'unsupported'} onClick={() => void up.check()}>
                  <RefreshCw aria-hidden size={18} />
                  {t('settings.check')}
                </button>
              )}
              {status.state === 'error' && (
                <button type="button" className="btn" onClick={() => void up.openReleases()}>{t('settings.openDownloadPage')}</button>
              )}
            </div>
            {mac && <p className="mt-3 text-sm text-muted">{t('settings.macNote')}</p>}
          </>
        ) : (
          <p className="mt-2 text-muted">{t('settings.webNote')}</p>
        )}
      </section>

      {desktop?.openDataDir && info && (
        <section className="mt-4 rounded-[var(--r-md)] border border-line bg-surface p-4" aria-labelledby="set-data">
          <h2 id="set-data" className="section-title">{t('settings.data')}</h2>
          <p className="mt-2 text-muted">{t('settings.dataHint')}</p>
          <p className="mt-2 break-all font-mono text-sm">{info.dataDir}</p>
          <button type="button" className="btn mt-3" onClick={() => void desktop.openDataDir!()}>
            <FolderOpen aria-hidden size={18} />
            {t('settings.openFolder')}
          </button>
        </section>
      )}
    </div>
  )
}
