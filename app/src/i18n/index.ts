import en from './en.json'
import es from './es.json'
import fr from './fr.json'
import ja from './ja.json'

export type TranslationKey = keyof typeof en
export type Messages = Record<TranslationKey, string>
export type Vars = Record<string, string | number>
export type Translate = (key: TranslationKey, vars?: Vars) => string

/** Endonyms, so each option reads in its own language. */
export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'ja', label: '日本語' },
] as const
export type Locale = (typeof LOCALES)[number]['code']
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'ii_locale'

// `Messages` makes a missing key in any catalog a type error. Upstream generated these with AWS Translate.
const catalogs: Record<Locale, Messages> = { en, fr, es, ja }

export class I18n {
  static isLocale(value: string | undefined | null): value is Locale {
    return LOCALES.some((l) => l.code === value)
  }

  /** Cookie wins, then the first supported language in Accept-Language, then English. Same on server and client. */
  static resolve(cookie: string | undefined, acceptLanguage: string | undefined): Locale {
    if (I18n.isLocale(cookie)) return cookie
    for (const part of (acceptLanguage ?? '').split(',')) {
      const base = part.split(';')[0].trim().slice(0, 2).toLowerCase()
      if (I18n.isLocale(base)) return base
    }
    return DEFAULT_LOCALE
  }

  static translator(locale: Locale): Translate {
    const messages = catalogs[locale]
    return (key, vars) => {
      const text = messages[key]
      return vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : text
    }
  }
}
