import type { Translate } from '#/i18n'

export type WaitLevel = 'closed' | 'short' | 'moderate' | 'long'

/** Turns a wait into a level and plain-text label. Colour is never the only signal in the UI. */
export class WaitLabel {
  static level(wait: number, closed: boolean): WaitLevel {
    if (closed) return 'closed'
    if (wait < 20) return 'short'
    if (wait < 45) return 'moderate'
    return 'long'
  }

  static text(wait: number, closed: boolean, t: Translate): string {
    if (closed) return t('wait.closed')
    return wait === 0 ? t('wait.none') : t('wait.minutes', { n: wait })
  }

  /** Spoken form for aria-labels: "Cold Start Coaster, 25 minute wait". */
  static spoken(name: string, wait: number, closed: boolean, t: Translate): string {
    if (closed) return t('wait.spokenClosed', { name })
    return wait === 0 ? t('wait.spokenNone', { name }) : t('wait.spokenMinutes', { name, n: wait })
  }
}
