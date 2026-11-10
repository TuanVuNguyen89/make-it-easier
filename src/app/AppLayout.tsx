import { Outlet, NavLink, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Clock, FileText, Image as ImageIcon, ImagePlus, Search, Settings, Star, Trash2, Wrench } from 'lucide-react'
import { LANGS, type Lang } from '@/i18n'

const links = [
  { to: '/documents/all', key: 'nav.all', icon: FileText },
  { to: '/documents/recent', key: 'nav.recent', icon: Clock },
  { to: '/documents/favorites', key: 'nav.favorites', icon: Star },
  { to: '/documents/trash', key: 'nav.trash', icon: Trash2 },
] as const

const imageLinks = [
  { to: '/images/all', key: 'nav.imagesAll', icon: ImageIcon },
  { to: '/images/recent', key: 'nav.recent', icon: Clock },
  { to: '/images/trash', key: 'nav.trash', icon: Trash2 },
] as const

function Topbar() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''

  const onSearch = (value: string) => {
    const onDocs = /^\/(documents|images)\//.test(location.pathname)
    const base = onDocs ? location.pathname : '/documents/all'
    navigate(value ? `${base}?q=${encodeURIComponent(value)}` : base, { replace: onDocs })
  }

  return (
    <header
      className="fixed inset-x-0 top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-4"
      style={{ height: 'var(--topbar-h)' }}
    >
      <NavLink to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
        <img src="/favicon.svg" alt="" width={28} height={28} />
        <span className="hidden sm:inline">{t('app.name')}</span>
        <span className="sr-only sm:hidden">{t('app.name')}</span>
      </NavLink>
      <div className="relative mx-auto w-full max-w-xl">
        <label htmlFor="global-search" className="sr-only">
          {t('topbar.search')}
        </label>
        <Search aria-hidden size={18} className="pointer-events-none absolute left-3 top-3 text-muted" />
        <input
          id="global-search"
          type="search"
          className="field-input"
          style={{ paddingLeft: 40, minHeight: 40 }}
          placeholder={t('topbar.search')}
          value={q}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="lang" className="sr-only">
          {t('topbar.language')}
        </label>
        <select
          id="lang"
          className="field-input"
          style={{ minHeight: 40, width: 'auto' }}
          value={i18n.language}
          onChange={(e) => void i18n.changeLanguage(e.target.value as Lang)}
        >
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </select>
      </div>
    </header>
  )
}

function Sidebar() {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('nav.main')}
      className="fixed bottom-0 left-0 right-0 z-10 flex justify-around border-t border-line bg-surface px-1 pb-[env(safe-area-inset-bottom)] sm:bottom-0 sm:right-auto sm:top-[var(--topbar-h)] sm:block sm:w-60 sm:border-r sm:border-t-0 sm:px-3 sm:py-4"
    >
      <p className="mb-1 hidden px-3 text-[13px] font-medium text-muted sm:block">{t('nav.documents')}</p>
      {links.map(({ to, key, icon: Icon }) => (
        <NavLink key={to} to={to} className="nav-link flex-col !gap-0 text-[13px] sm:flex-row sm:!gap-3 sm:text-base">
          <Icon aria-hidden size={20} />
          {t(key)}
        </NavLink>
      ))}
      <p className="mb-1 mt-4 hidden px-3 text-[13px] font-medium text-muted sm:block">{t('nav.images')}</p>
      {imageLinks.map(({ to, key, icon: Icon }) => (
        <NavLink key={to} to={to} className="nav-link hidden sm:flex sm:!gap-3 sm:text-base">
          <Icon aria-hidden size={20} />
          {t(key)}
        </NavLink>
      ))}
      <NavLink to="/images/all" className="nav-link flex-col !gap-0 text-[13px] sm:hidden">
        <ImageIcon aria-hidden size={20} />
        {t('nav.images')}
      </NavLink>
      <p className="mb-1 mt-4 hidden px-3 text-[13px] font-medium text-muted sm:block">{t('nav.tools')}</p>
      <NavLink to="/tools" end className="nav-link flex-col !gap-0 text-[13px] sm:flex-row sm:!gap-3 sm:text-base">
        <Wrench aria-hidden size={20} />
        <span className="sm:hidden">{t('nav.tools')}</span>
        <span className="hidden sm:inline">{t('nav.pdfTools')}</span>
      </NavLink>
      <NavLink to="/tools/images" className="nav-link hidden sm:flex sm:!gap-3 sm:text-base">
        <ImagePlus aria-hidden size={20} />
        {t('nav.imageTools')}
      </NavLink>
      <NavLink to="/settings" className="nav-link flex-col !gap-0 text-[13px] sm:mt-4 sm:flex-row sm:!gap-3 sm:text-base">
        <Settings aria-hidden size={20} />
        {t('nav.settings')}
      </NavLink>
    </nav>
  )
}

export function AppLayout() {
  const { t } = useTranslation()
  return (
    <>
      <a href="#main" className="skip-link">
        {t('app.skipLink')}
      </a>
      <Topbar />
      <Sidebar />
      <main
        id="main"
        className="px-4 pb-24 pt-[calc(var(--topbar-h)+var(--s-5))] sm:ml-60 sm:px-8 sm:pb-12"
      >
        <Outlet />
      </main>
    </>
  )
}
