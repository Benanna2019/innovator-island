import { useAuthActions } from '@convex-dev/auth/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useConvexAuth, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../convex/_generated/api'
import { useI18n } from '#/components/I18nProvider'
import { SiteFooter } from '#/components/SiteFooter'
import { SiteHeader } from '#/components/SiteHeader'
import type { TranslationKey } from '#/i18n'

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    // Only same-site paths, so a crafted link cannot send someone to another site after sign-in.
    const redirect = typeof search.redirect === 'string' && /^\/(?![/\\])/.test(search.redirect) ? search.redirect : undefined
    return redirect ? { redirect } : {}
  },
  component: SignIn,
})

type Problem = 'invalid' | 'exists' | 'closed' | 'email' | 'password' | 'unknown'
type Field = 'email' | 'password'

function problemFrom(error: unknown, mode: 'signIn' | 'signUp'): Problem {
  // Production strips the message of a plain Error, so the closed sign-up is a ConvexError with a code instead.
  if (error instanceof ConvexError && (error.data as { code?: string } | undefined)?.code === 'SignUpClosed') return 'closed'
  const message = error instanceof Error ? error.message : ''
  if (/already exists|exist/i.test(message) && mode === 'signUp') return 'exists'
  if (/InvalidAccountId|InvalidSecret|Invalid/i.test(message)) return mode === 'signUp' ? 'password' : 'invalid'
  return mode === 'signIn' ? 'invalid' : 'unknown'
}

function SignIn() {
  const { t } = useI18n()
  const { redirect } = Route.useSearch()
  const navigate = useNavigate()
  const { signIn } = useAuthActions()
  const { isAuthenticated } = useConvexAuth()
  const config = useQuery(api.viewer.publicConfig)
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [problem, setProblem] = useState<{ kind: Problem; field: Field | null } | null>(null)
  // Bumped on every failure so focus returns to the first bad field even when the message repeats.
  const [failures, setFailures] = useState(0)
  const [busy, setBusy] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isAuthenticated) void navigate({ to: redirect ?? '/' })
  }, [isAuthenticated, navigate, redirect])

  useEffect(() => {
    if (failures === 0) return
    ;(problem?.field === 'password' ? passwordRef : emailRef).current?.focus()
  }, [failures, problem?.field])

  function fail(kind: Problem, field: Field | null) {
    setProblem({ kind, field })
    setBusy(false)
    setFailures((n) => n + 1)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('email', 'email')
    if (password.length < 8) return fail('password', 'password')
    setProblem(null)
    setBusy(true)
    try {
      const name = String(form.get('name') ?? '').trim()
      await signIn('password', { email, password, flow: mode, ...(mode === 'signUp' && name ? { name } : {}) })
    } catch (error) {
      fail(problemFrom(error, mode), 'email')
    }
  }

  async function signInAsDemo(who: string) {
    setProblem(null)
    setBusy(true)
    try {
      await signIn('demo', { who })
    } catch {
      setBusy(false)
      setProblem({ kind: 'unknown', field: null })
      setFailures((n) => n + 1)
    }
  }

  const errorKey = problem ? (problem.field === null ? 'auth.demo.err' : (`auth.err.${problem.kind}` as TranslationKey)) : null
  const describedBy = problem ? 'auth-error' : undefined

  return (
    <>
      <SiteHeader title={t('auth.title')} intro={t('auth.intro')} />
      <main id="main" tabIndex={-1}>
        {isAuthenticated ? (
          <p className="empty">{t('auth.alreadyIn')}</p>
        ) : (
          <>
            <form onSubmit={(e) => void onSubmit(e)} noValidate className="form">
              {mode === 'signUp' && (
                <div className="field">
                  <label htmlFor="name">{t('auth.name')}</label>
                  <input id="name" name="name" type="text" autoComplete="name" />
                </div>
              )}
              <div className="field">
                <label htmlFor="email">{t('auth.email')}</label>
                <input
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  required
                  aria-invalid={problem && problem.field !== 'password' && problem.field !== null ? true : undefined}
                  aria-describedby={problem?.field !== 'password' ? describedBy : undefined}
                />
              </div>
              <div className="field">
                <label htmlFor="password">{t('auth.password')}</label>
                <input
                  ref={passwordRef}
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                  minLength={8}
                  required
                  aria-invalid={problem?.field === 'password' ? true : undefined}
                  aria-describedby={problem?.field === 'password' ? describedBy : undefined}
                />
              </div>
              <div aria-live="polite">
                {errorKey && (
                  <p id="auth-error" className="error">
                    <strong>{t('auth.err.summary')}</strong> {t(errorKey)}
                  </p>
                )}
              </div>
              <button type="submit" disabled={busy}>
                {busy ? t('auth.working') : mode === 'signIn' ? t('auth.submit.signIn') : t('auth.submit.signUp')}
              </button>
              {config?.signUpOpen && (
                <button
                  type="button"
                  className="button button--link"
                  onClick={() => {
                    setMode(mode === 'signIn' ? 'signUp' : 'signIn')
                    setProblem(null)
                  }}
                >
                  {mode === 'signIn' ? t('auth.toSignUp') : t('auth.toSignIn')}
                </button>
              )}
            </form>
            {config?.demoMode && (
              <section aria-labelledby="demo-heading" className="form demo-box">
                <h2 id="demo-heading">{t('auth.demo.heading')}</h2>
                <p className="hint">{t('auth.demo.hint')}</p>
                <div className="demo-box__buttons">
                  <button type="button" disabled={busy} onClick={() => void signInAsDemo('guest-1')}>
                    {t('auth.demo.guest')}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
