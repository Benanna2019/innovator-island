import { useConvex } from 'convex/react'
import { ConvexError } from 'convex/values'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../convex/_generated/api'
import { MAX_UPLOAD_BYTES, PhotoValidation } from '#/domain/photo-validation'
import type { TranslationKey } from '#/i18n'
import { useI18n } from './I18nProvider'

const PARK_SLUG = 'innovator-island'
const MAX_MB = MAX_UPLOAD_BYTES / (1024 * 1024)

type Problem = 'none' | 'UploadTooLarge' | 'NotAnImage' | 'RateLimited' | 'Unknown'
type Phase = 'idle' | 'uploading' | 'queued'

function problemFrom(error: unknown): Problem {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: string; kind?: string } | undefined
    if (data?.code === 'UploadTooLarge' || data?.code === 'NotAnImage') return data.code
    if (data?.kind === 'RateLimited') return 'RateLimited'
  }
  return 'Unknown'
}

/**
 * Replaces the upstream `getUploadURL` Lambda plus a presigned S3 PUT. The browser checks type and size first (a
 * courtesy), then asks for an upload URL, POSTs the file straight to Convex storage and submits it, and the server
 * validates the stored file again.
 */
export function PhotoUploadForm({ guestId }: { guestId: string }) {
  const { t } = useI18n()
  const convex = useConvex()
  const inputRef = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  // Bumped on every failed submit so focus moves to the field even when the message is the same as last time.
  const [failures, setFailures] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    if (failures > 0) inputRef.current?.focus()
  }, [failures])

  function fail(next: Problem) {
    setProblem(next)
    setPhase('idle')
    setFailures((n) => n + 1)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = inputRef.current?.files?.[0]
    if (!file) return fail('none')
    const invalid = PhotoValidation.firstError(file)
    if (invalid) return fail(invalid._tag)

    setProblem(null)
    setPhase('uploading')
    try {
      const url = await convex.mutation(api.photos.generateUploadUrl, { guestId })
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
      if (!response.ok) return fail('Unknown')
      const { storageId } = (await response.json()) as { storageId: (typeof api.photos.submit)['_args']['storageId'] }
      const result = await convex.mutation(api.photos.submit, { guestId, parkSlug: PARK_SLUG, storageId })
      if (!result.ok) return fail(result.code)
      setPhase('queued')
      if (inputRef.current) inputRef.current.value = ''
    } catch (error) {
      fail(problemFrom(error))
    }
  }

  const errorKey: TranslationKey | null = problem ? (`photos.err.${problem}` as TranslationKey) : null

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="form">
      <div className="field">
        <label htmlFor="photo-file">{t('photos.fileLabel')}</label>
        <input
          ref={inputRef}
          id="photo-file"
          name="photo"
          type="file"
          accept="image/jpeg,image/png"
          capture="user"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? 'photo-hint photo-error' : 'photo-hint'}
          onChange={() => setProblem(null)}
        />
        <p id="photo-hint" className="hint">
          {t('photos.fileHint', { max: MAX_MB })}
        </p>
      </div>
      {/* No live region here: focus moves to the input on failure and aria-describedby reads this, so it is announced once. */}
      <div>
        {errorKey && (
          <p id="photo-error" className="error">
            <strong>{t('photos.errorSummary')}</strong> {t(errorKey, { max: MAX_MB })}
          </p>
        )}
      </div>
      <button type="submit" disabled={phase === 'uploading'}>
        {t('photos.submit')}
      </button>
      <p role="status" aria-live="polite" className="status">
        {phase === 'uploading' ? t('photos.uploading') : phase === 'queued' ? t('photos.queued') : ''}
      </p>
    </form>
  )
}
