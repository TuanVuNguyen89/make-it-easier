import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { groupsByKind, toolsOfKind } from '@/tools/registry'
import type { ToolGroup, ToolKind } from '@/tools/types'

export function ToolsPage({ kind = 'pdf' }: { kind?: ToolKind }) {
  const { t } = useTranslation()
  const [group, setGroup] = useState<ToolGroup | 'all'>('all')
  const [query, setQuery] = useState('')
  const all = useMemo(() => toolsOfKind(kind), [kind])
  const groups = groupsByKind[kind]

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter(
      (x) =>
        (group === 'all' || x.group === group) &&
        (!q || `${t(`tools.${x.id}.name`)} ${t(`tools.${x.id}.desc`)}`.toLowerCase().includes(q)),
    )
  }, [all, group, query, t])

  return (
    <div>
      <h1 className="page-title">{t(kind === 'image' ? 'tools.imageTitle' : 'tools.title')}</h1>
      <p className="mt-2 max-w-[62ch] text-muted">{t('tools.intro')}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div role="group" aria-label={t(kind === 'image' ? 'tools.imageTitle' : 'tools.title')} className="flex flex-wrap gap-2">
          {(['all', ...groups] as const).map((g) => (
            <button key={g} type="button" aria-pressed={group === g} className={`btn ${group === g ? 'btn-primary' : ''}`} onClick={() => setGroup(g)}>
              {g === 'all' ? t('tools.allGroups') : t(`tools.groups.${g}`)}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full max-w-xs">
          <label htmlFor="tool-search" className="sr-only">
            {t('tools.search')}
          </label>
          <Search aria-hidden size={18} className="pointer-events-none absolute left-3 top-3.5 text-muted" />
          <input id="tool-search" type="search" className="field-input" style={{ paddingLeft: 40 }} placeholder={t('tools.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 text-muted" role="status">
          {t('tools.noMatch')}
        </p>
      ) : (
        <ul className="mt-6 grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {shown.map(({ id, icon: Icon }) => (
            <li key={id}>
              <Link to={`/tools/${id}`} className="card card-link h-full">
                <Icon aria-hidden size={28} className="text-action" />
                <h2 className="mt-3 font-display text-base font-semibold">{t(`tools.${id}.name`)}</h2>
                <p className="mt-1 text-muted">{t(`tools.${id}.desc`)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
