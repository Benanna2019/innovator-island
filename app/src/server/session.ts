import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequestHeader, getRequestUrl, setCookie } from '@tanstack/react-start/server'
import { DEFAULT_LOCALE, I18n, LOCALE_COOKIE } from '#/i18n'
import type { Locale } from '#/i18n'

const YEAR = 60 * 60 * 24 * 365

/** Secure cookies are dropped by Safari on http://localhost, so ask for secure only when the request was https. */
const isSecure = () => getRequestUrl().protocol === 'https:'

/**
 * The language, from a cookie read on the server, so the first paint is already in the right language. Who is signed
 * in is not decided here: Convex Auth keeps the session in the browser and Convex checks it on every call.
 */
export const getSession = createServerFn({ method: 'GET' }).handler(async (): Promise<{ locale: Locale }> => {
  return { locale: I18n.resolve(getCookie(LOCALE_COOKIE), getRequestHeader('accept-language')) }
})

export const setLocale = createServerFn({ method: 'POST' })
  .validator((data: { locale: string }) => data)
  .handler(async ({ data }): Promise<Locale> => {
    const locale = I18n.isLocale(data.locale) ? data.locale : DEFAULT_LOCALE
    setCookie(LOCALE_COOKIE, locale, { maxAge: YEAR, path: '/', sameSite: 'lax', secure: isSecure() })
    return locale
  })
