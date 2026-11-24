import { createFileRoute, useLoaderData } from '@tanstack/react-router'
import { useI18n } from '#/components/I18nProvider'
import { PhotoGallery } from '#/components/PhotoGallery'
import { PhotoUploadForm } from '#/components/PhotoUploadForm'
import { SiteFooter } from '#/components/SiteFooter'
import { SiteHeader } from '#/components/SiteHeader'

export const Route = createFileRoute('/photos')({ component: Photos })

function Photos() {
  const { t } = useI18n()
  const { guestId } = useLoaderData({ from: '__root__' })
  return (
    <>
      <SiteHeader title={t('photos.title')} intro={t('photos.intro')} />
      <main id="main" tabIndex={-1}>
        <PhotoUploadForm guestId={guestId} />
        <PhotoGallery guestId={guestId} />
      </main>
      <SiteFooter />
    </>
  )
}
