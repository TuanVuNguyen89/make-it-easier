import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { openLibraryDb } from './db'
import { desktopStore } from './desktopStore'
import { createRepository, type Repository } from './repository'

const Ctx = createContext<Repository | null>(null)

export function RepositoryProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [repo, setRepo] = useState<Repository | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    // App máy tính: SQLite + tệp thật qua IPC; web: IndexedDB.
    const open = window.desktop ? Promise.resolve(desktopStore(window.desktop)) : openLibraryDb()
    open
      .then((db) => alive && setRepo(createRepository(db)))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  if (failed) {
    return (
      <p role="alert" className="notice notice-error m-6">
        {t('errors.storageUnavailable')}
      </p>
    )
  }
  if (!repo) return null
  return <Ctx.Provider value={repo}>{children}</Ctx.Provider>
}

export function useRepository(): Repository {
  const repo = useContext(Ctx)
  if (!repo) throw new Error('useRepository must be used inside RepositoryProvider')
  return repo
}
