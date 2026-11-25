import { useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { TranslationKey } from '#/i18n'
import { useI18n } from './I18nProvider'

/**
 * The live gallery. `useQuery` re-runs when the workflow finishes, so there is nothing to poll. Upstream pushed a
 * "photo ready" message to the browser over IoT MQTT with a Cognito identity.
 */
export function PhotoGallery() {
  const { t, locale } = useI18n()
  const photos = useQuery(api.photos.mine, {})
  const ready = photos?.filter((p) => p.status === 'ready').length ?? 0
  const previousReady = useRef<number | null>(null)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (photos === undefined) return
    if (previousReady.current !== null && ready > previousReady.current) setAnnouncement(t('photos.ready'))
    previousReady.current = ready
  }, [photos, ready, t])

  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' })

  return (
    <section aria-labelledby="gallery-heading">
      <h2 id="gallery-heading">{t('photos.gallery')}</h2>
      <p role="status" aria-live="polite" className="status">
        {announcement}
      </p>
      {photos === undefined && <p className="hint">{t('photos.loading')}</p>}
      {photos && photos.length === 0 && <p className="hint">{t('photos.galleryEmpty')}</p>}
      <ul className="gallery">
        {photos?.map((p) => (
          <li key={p.id} className="gallery__item">
            {p.status === 'ready' && p.url ? (
              <>
                <img src={p.url} width={640} height={480} loading="lazy" alt={t('photos.alt', { when: when.format(p.createdAt) })} />
                <p className="ticket__stub">{when.format(p.createdAt)}</p>
              </>
            ) : p.status === 'failed' ? (
              <p className="error">
                {t('photos.failed')} {t((p.failure === 'NotAnImage' ? 'photos.err.NotAnImage' : 'photos.err.ChromaKeyFailed') as TranslationKey, { max: 5 })}
              </p>
            ) : (
              <p className="hint">{t('photos.processing')}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
