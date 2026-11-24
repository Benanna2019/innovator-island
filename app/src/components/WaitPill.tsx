import { WaitLabel } from '#/domain/wait-label'
import type { WaitLevel } from '#/domain/wait-label'
import { useI18n } from './I18nProvider'

/** Colour plus words: the level only sets the colour, the text always says the wait or "Closed". */
export function WaitPill({ wait, closed, level }: { wait: number; closed: boolean; level: WaitLevel }) {
  const { t } = useI18n()
  return (
    // The key remounts the pill when the wait changes, which replays the CSS pop animation.
    <span key={`${wait}-${closed}`} className={`pill pill--${level}`}>
      {closed && <ClosedSign />}
      {WaitLabel.text(wait, closed, t)}
    </span>
  )
}

function ClosedSign() {
  return (
    <svg className="pill__sign" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3.5 12.5 12.5 3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function rideIconSrc(icon: string | null): string | null {
  return icon ? `/park/rides/${icon}.webp` : null
}
