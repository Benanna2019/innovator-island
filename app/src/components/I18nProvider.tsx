import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { I18n } from '#/i18n'
import type { Locale, Translate } from '#/i18n'

interface I18nValue {
  locale: Locale
  t: Translate
}

const I18nContext = createContext<I18nValue | null>(null)

/** The locale comes from the root loader, which reads the cookie on the server, so SSR and hydration agree. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: I18n.translator(locale) }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
