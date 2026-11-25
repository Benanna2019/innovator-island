import { Link, createFileRoute } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { useI18n } from '#/components/I18nProvider'
import { PhotoGallery } from '#/components/PhotoGallery'
import { PhotoUploadForm } from '#/components/PhotoUploadForm'
import { SiteFooter } from '#/components/SiteFooter'
import { SiteHeader } from '#/components/SiteHeader'

export const Route = createFileRoute('/photos')({ component: Photos })

function Photos() {
  const { t } = useI18n()
  const { isLoading, isAuthenticated } = useConvexAuth()
  return (
    <>
      <SiteHeader title={t('photos.title')} intro={t('photos.intro')} />
      <main id="main" tabIndex={-1}>
        {isLoading ? (
          <p className="hint" role="status">
            {t('auth.checking')}
          </p>
        ) : isAuthenticated ? (
          <>
            <PhotoUploadForm />
            <PhotoGallery />
          </>
        ) : (
          <section className="empty" aria-labelledby="login-heading">
            <h2 id="login-heading">{t('photos.needLoginLink')}</h2>
            <p>{t('photos.needLogin')}</p>
            <Link to="/sign-in" search={{ redirect: '/photos' }} className="button">
              {t('nav.signIn')}
            </Link>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
