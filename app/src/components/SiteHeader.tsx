import { Link } from '@tanstack/react-router'
import { useI18n } from './I18nProvider'
import { LanguagePicker } from './LanguagePicker'

/** A park entrance sign: a wordmark sign, a sea-to-sunset gradient and pill-shaped nav. */
export function SiteHeader({ title, intro }: { title: string; intro: string }) {
  const { t } = useI18n()
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <div className="site-header__bar">
          <Link to="/" className="site-header__logo">
            {t('site.logoAlt')}
          </Link>
          <nav aria-label={t('nav.label')}>
            <ul className="nav">
              <li>
                <Link to="/">{t('nav.map')}</Link>
              </li>
              <li>
                <Link to="/photos">{t('nav.photos')}</Link>
              </li>
              <li>
                <Link to="/stats">{t('nav.stats')}</Link>
              </li>
            </ul>
          </nav>
          <LanguagePicker />
        </div>
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
    </header>
  )
}
