import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequestHeader, getRequestUrl, setCookie } from '@tanstack/react-start/server'
import { GuestId } from '#/domain/guest-id'
import { DEFAULT_LOCALE, I18n, LOCALE_COOKIE } from '#/i18n'
import type { Locale } from '#/i18n'

export const GUEST_COOKIE = 'ii_guest'
const YEAR = 60 * 60 * 24 * 365

/** Secure cookies are dropped by Safari on http://localhost, so ask for secure only when the request was https. */
const isSecure = () => getRequestUrl().protocol === 'https:'

/**
 * Anonymous identity and language, both in cookies and both read on the server, so the first paint is already in the
 * right language. Replaces the Cognito identity pool. The guest id is a bearer secret: it is the only thing
 * that gates reading a gallery, so it is a random UUID in an httpOnly cookie.
 */
export const getSession = createServerFn({ method: 'GET' }).handler(async (): Promise<{ guestId: string; locale: Locale }> => {
  let guestId = getCookie(GUEST_COOKIE)
  if (!guestId || !GuestId.isValid(guestId)) {
    guestId = crypto.randomUUID()
    setCookie(GUEST_COOKIE, guestId, { maxAge: YEAR, path: '/', sameSite: 'lax', httpOnly: true, secure: isSecure() })
  }
  return { guestId, locale: I18n.resolve(getCookie(LOCALE_COOKIE), getRequestHeader('accept-language')) }
})

export const setLocale = createServerFn({ method: 'POST' })
  .validator((data: { locale: string }) => data)
  .handler(async ({ data }): Promise<Locale> => {
    const locale = I18n.isLocale(data.locale) ? data.locale : DEFAULT_LOCALE
    setCookie(LOCALE_COOKIE, locale, { maxAge: YEAR, path: '/', sameSite: 'lax', secure: isSecure() })
    return locale
  })
