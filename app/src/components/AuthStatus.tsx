import { useAuthActions } from '@convex-dev/auth/react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useConvexAuth, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useI18n } from './I18nProvider'

/** Who is signed in, with sign out, or a sign-in link. Only the text is a live region, so the button is not read out with it. */
export function AuthStatus() {
  const { t } = useI18n()
  const { isLoading, isAuthenticated } = useConvexAuth()
  const me = useQuery(api.viewer.me, isAuthenticated ? {} : 'skip')
  const { signOut } = useAuthActions()
  const navigate = useNavigate()

  return (
    <div className="auth-status">
      {isLoading ? (
        <span className="visually-hidden" role="status">
          {t('auth.checking')}
        </span>
      ) : isAuthenticated && me ? (
        <>
          <span className="auth-status__who" role="status">{t('auth.signedInAs', { name: me.name })}</span>
          <button
            type="button"
            className="auth-status__button"
            onClick={() => {
              void signOut().then(() => navigate({ to: '/' }))
            }}
          >
            {t('auth.signOut')}
          </button>
        </>
      ) : isAuthenticated ? null : (
        <Link to="/sign-in" className="auth-status__link">
          {t('nav.signIn')}
        </Link>
      )}
    </div>
  )
}
