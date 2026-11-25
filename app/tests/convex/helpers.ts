import aggregateTest from '@convex-dev/aggregate/test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import workflowTest from '@convex-dev/workflow/test'
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'
import { internal } from '../../convex/_generated/api'
import '../../convex/subscribers'

export const modules = import.meta.glob('../../convex/**/*.ts')

const create = () => convexTest(schema, modules)
export type Tester = ReturnType<typeof create>

/** A test backend with the park seeded and every component registered. */
export async function seeded(): Promise<Tester> {
  const t = create()
  aggregateTest.register(t, 'parkStats')
  rateLimiterTest.register(t, 'rateLimiter')
  workflowTest.register(t, 'workflow')
  await t.mutation(internal.seed.run, {})
  return t
}

/** Inserts a user with a role and returns a handle that calls functions as that user. */
export async function signedIn(t: Tester, role: 'admin' | 'guest' | undefined, email = `${role ?? 'plain'}@example.test`) {
  const userId = await t.run((ctx) => ctx.db.insert('users', { email, name: email, ...(role ? { role } : {}) }))
  // Convex Auth reads the user id from the first part of the token subject.
  return { userId, as: t.withIdentity({ subject: `${userId}|test-session`, issuer: 'https://example.test' }) }
}
