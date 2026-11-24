import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { LOCALES } from '#/i18n'
import { setLocale } from '#/server/session'
import { useI18n } from './I18nProvider'

export function LanguagePicker() {
  const { locale, t } = useI18n()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function change(next: string) {
    setPending(true)
    setFailed(false)
    try {
      await setLocale({ data: { locale: next } })
      await router.invalidate()
    } catch {
      // The select is controlled by the saved locale, so it already shows the old language again.
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="lang">
      <label htmlFor="language">{t('lang.label')}</label>
      <select
        id="language"
        name="language"
        value={locale}
        disabled={pending}
        aria-busy={pending}
        aria-describedby={failed ? 'language-error' : undefined}
        onChange={(e) => void change(e.target.value)}
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <p id="language-error" role="alert" className="error" hidden={!failed}>
        {failed ? t('lang.error') : ''}
      </p>
    </div>
  )
}
