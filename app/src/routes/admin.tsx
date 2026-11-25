import { createFileRoute, Link } from '@tanstack/react-router'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { useI18n } from '#/components/I18nProvider'
import { SiteFooter } from '#/components/SiteFooter'
import { SiteHeader } from '#/components/SiteHeader'
import type { TranslationKey } from '#/i18n'

export const Route = createFileRoute('/admin')({ component: Admin })

function Admin() {
  const { t } = useI18n()
  const { isLoading, isAuthenticated } = useConvexAuth()
  const me = useQuery(api.viewer.me, isAuthenticated ? {} : 'skip')
  return (
    <>
      <SiteHeader title={t('admin.title')} intro={t('admin.intro')} />
      <main id="main" tabIndex={-1}>
        {isLoading || (isAuthenticated && me === undefined) ? (
          <p className="hint" role="status">
            {t('auth.checking')}
          </p>
        ) : !isAuthenticated ? (
          <section className="empty" aria-labelledby="gate-heading">
            <h2 id="gate-heading">{t('admin.forbidden.title')}</h2>
            <p>{t('admin.signedOut')}</p>
            <Link to="/sign-in" search={{ redirect: '/admin' }} className="button">
              {t('nav.signIn')}
            </Link>
          </section>
        ) : me?.role !== 'admin' ? (
          <section className="empty" aria-labelledby="gate-heading">
            <h2 id="gate-heading">{t('admin.forbidden.title')}</h2>
            <p>{t('admin.forbidden.body')}</p>
          </section>
        ) : (
          <Console />
        )}
      </main>
      <SiteFooter />
    </>
  )
}

type Notice = { kind: 'ok' | 'error'; text: string }

/** Works out which message to show from a ConvexError thrown by an admin mutation. */
function errorText(error: unknown, t: (key: TranslationKey, vars?: Record<string, string | number>) => string): string {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: string; min?: number; max?: number } | undefined
    if (data?.code === 'BadMaxWait') return t('admin.err.maxWait', { min: data.min ?? 0, max: data.max ?? 240 })
    if (data?.code === 'BadProbability') return t('admin.err.probability')
    if (data?.code === 'NotDemo') return t('admin.reset.notDemo')
    if (data?.code === 'ResetRunning') return t('admin.err.resetRunning')
    if ((data as { kind?: string } | undefined)?.kind === 'RateLimited') return t('admin.err.rateLimited')
  }
  return t('admin.err.generic')
}

function Console() {
  const { t } = useI18n()
  const overview = useQuery(api.admin.overview, {})
  const setSimulation = useMutation(api.admin.setSimulation)
  const triggerOutage = useMutation(api.admin.triggerOutage)
  const reopenRide = useMutation(api.admin.reopenRide)
  const resetDemo = useMutation(api.admin.resetDemo)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)

  async function run(action: () => Promise<unknown>, ok: string) {
    setNotice(null)
    try {
      await action()
      setNotice({ kind: 'ok', text: ok })
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error, t) })
    }
  }

  if (overview === undefined) {
    return (
      <p className="hint" role="status">
        {t('photos.loading')}
      </p>
    )
  }
  if (overview === null) return <p className="empty">{t('stats.empty')}</p>

  return (
    <>
      <p role="status" aria-live="polite" className={notice?.kind === 'error' ? 'error' : 'status'}>
        {notice?.text ?? ''}
      </p>
      <section aria-labelledby="sim-heading">
        <h2 id="sim-heading">{t('admin.sim.heading')}</h2>
        <p>{overview.simulationEnabled ? t('admin.sim.on') : t('admin.sim.off')}</p>
        <button
          type="button"
          onClick={() =>
            void run(() => setSimulation({ enabled: !overview.simulationEnabled }), overview.simulationEnabled ? t('admin.sim.off') : t('admin.sim.on'))
          }
        >
          {overview.simulationEnabled ? t('admin.sim.pause') : t('admin.sim.resume')}
        </button>
      </section>
      <section aria-labelledby="rides-heading">
        <h2 id="rides-heading">{t('admin.rides.heading')}</h2>
        <ul className="admin-rides">
          {overview.rides.map((ride) => (
            <RideRow
              key={ride.id}
              ride={ride}
              onOutage={() => run(() => triggerOutage({ rideId: ride.id }), t('admin.rides.opened', { ride: ride.name }))}
              onReopen={() => run(() => reopenRide({ rideId: ride.id }), t('admin.rides.reopened', { ride: ride.name }))}
              onSaved={(text) => setNotice({ kind: 'ok', text })}
              onFailed={(text) => setNotice({ kind: 'error', text })}
            />
          ))}
        </ul>
      </section>
      <section aria-labelledby="reset-heading">
        <h2 id="reset-heading">{t('admin.reset.heading')}</h2>
        <p>{t('admin.reset.body')}</p>
        {!overview.demoMode ? (
          <p className="hint">{t('admin.reset.notDemo')}</p>
        ) : confirmingReset ? (
          <div className="admin-row__actions">
            <button
              type="button"
              onClick={() => {
                setConfirmingReset(false)
                void run(() => resetDemo({}), t('admin.reset.started'))
              }}
            >
              {t('admin.reset.confirm')}
            </button>
            <button type="button" className="button--secondary" onClick={() => setConfirmingReset(false)}>
              {t('admin.reset.cancel')}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmingReset(true)}>
            {t('admin.reset.button')}
          </button>
        )}
      </section>
    </>
  )
}

interface RideView {
  id: Id<'rides'>
  name: string
  minWait: number
  maxWait: number
  closureProbability: number
  wait: number
  closed: boolean
  queue: number
}

function RideRow({
  ride,
  onOutage,
  onReopen,
  onSaved,
  onFailed,
}: {
  ride: RideView
  onOutage: () => void
  onReopen: () => void
  onSaved: (text: string) => void
  onFailed: (text: string) => void
}) {
  const { t } = useI18n()
  const updateRide = useMutation(api.admin.updateRide)
  const maxRef = useRef<HTMLInputElement>(null)
  const probRef = useRef<HTMLInputElement>(null)
  const [bad, setBad] = useState<'max' | 'prob' | null>(null)
  const [failures, setFailures] = useState(0)

  useEffect(() => {
    if (failures === 0) return
    ;(bad === 'prob' ? probRef : maxRef).current?.focus()
  }, [failures, bad])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const maxWait = Number(form.get('maxWait'))
    const closureProbability = Number(form.get('closureProbability'))
    const problem = !Number.isInteger(maxWait) || maxWait < ride.minWait || maxWait > 240 ? 'max' : !(closureProbability >= 0 && closureProbability <= 1) ? 'prob' : null
    if (problem) {
      setBad(problem)
      setFailures((n) => n + 1)
      onFailed(problem === 'max' ? t('admin.err.maxWait', { min: ride.minWait, max: 240 }) : t('admin.err.probability'))
      return
    }
    setBad(null)
    try {
      await updateRide({ rideId: ride.id, maxWait, closureProbability })
      onSaved(t('admin.rides.saved', { ride: ride.name }))
    } catch (error) {
      onFailed(errorText(error, t))
    }
  }

  const id = `ride-${ride.id}`
  return (
    <li className="admin-row">
      <h3 className="admin-row__name">{ride.name}</h3>
      <p className="admin-row__status">
        <span className={`pill ${ride.closed ? 'pill--closed' : 'pill--short'}`}>{ride.closed ? t('ride.statusClosed') : t('ride.statusOpen')}</span> {t('queue.chip', { n: ride.queue })}
      </p>
      <form key={`${ride.maxWait}-${ride.closureProbability}`} className="admin-row__form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <div className="field">
          <label htmlFor={`${id}-max`}>{t('admin.rides.maxWait')}</label>
          <input
            ref={maxRef}
            id={`${id}-max`}
            name="maxWait"
            type="number"
            inputMode="numeric"
            min={ride.minWait}
            max={240}
            step={1}
            defaultValue={ride.maxWait}
            aria-invalid={bad === 'max' ? true : undefined}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-prob`}>{t('admin.rides.closure')}</label>
          <input
            ref={probRef}
            id={`${id}-prob`}
            name="closureProbability"
            type="number"
            inputMode="decimal"
            min={0}
            max={1}
            step={0.005}
            defaultValue={ride.closureProbability}
            aria-invalid={bad === 'prob' ? true : undefined}
          />
        </div>
        <button type="submit">{t('admin.rides.save')}</button>
      </form>
      <div className="admin-row__actions">
        {ride.closed ? (
          <button type="button" onClick={onReopen}>
            {t('admin.rides.reopen')}
          </button>
        ) : (
          <button type="button" onClick={onOutage}>
            {t('admin.rides.outage')}
          </button>
        )}
      </div>
    </li>
  )
}
