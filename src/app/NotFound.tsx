import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="py-16 text-center">
      <h1 className="page-title">404</h1>
      <p className="mt-2 text-muted">{t('errors.notFound')}</p>
      <Link to="/" className="btn btn-primary mt-6">
        {t('common.home')}
      </Link>
    </div>
  )
}
