/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import type { ReactNode } from 'react'
import { I18nProvider, useI18n } from '#/components/I18nProvider'
import { I18n } from '#/i18n'
import type { Locale } from '#/i18n'
import { getSession } from '#/server/session'
import appCss from '#/styles.css?url'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
  convexQueryClient: ConvexQueryClient
}>()({
  // The language comes from a cookie. They only change through setLocale, which invalidates the router.
  loader: () => getSession(),
  staleTime: Infinity,
  head: ({ loaderData }) => {
    const t = I18n.translator(loaderData?.locale ?? 'en')
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: t('site.title') },
        { name: 'description', content: t('site.tagline') },
        { name: 'theme-color', content: '#0f4c5c' },
      ],
      links: [{ rel: 'stylesheet', href: appCss }],
    }
  },
  component: RootComponent,
})

function RootComponent() {
  const { convexQueryClient } = Route.useRouteContext()
  const { locale } = Route.useLoaderData()
  return (
    <I18nProvider locale={locale}>
      <RootDocument locale={locale}>
        <ConvexAuthProvider client={convexQueryClient.convexClient}>
          <Outlet />
        </ConvexAuthProvider>
      </RootDocument>
    </I18nProvider>
  )
}

function RootDocument({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <html lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        <a className="skip-link" href="#main">
          {t('site.skip')}
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
