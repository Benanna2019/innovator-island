import { describe, expect, it, vi } from 'vitest'
import { authorizeDemo } from '../convex/lib/demoAuth'
import { DEMO_ACCOUNTS, DEMO_GUESTS, DemoAccounts } from '#/domain/demo-accounts'

const lookup = vi.fn(async (email: string) => `user-for-${email}` as never)

describe('demo sign-in', () => {
  it('refuses everything when demo mode is off, without looking anything up', async () => {
    lookup.mockClear()
    await expect(authorizeDemo(lookup, false, 'guest-1')).rejects.toThrow(/turned off/)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('refuses a `who` that is not in the allow-list, including emails and inherited object keys', async () => {
    lookup.mockClear()
    for (const who of ['', 'admin', 'Admin', 'demo-admin', 'root', 'someone@example.com', DEMO_ACCOUNTS.admin.email, '__proto__', 'constructor', 'toString', 'guest-4', undefined, null, 1, {}]) {
      await expect(authorizeDemo(lookup, true, who), String(who)).rejects.toThrow(/Unknown demo account/)
    }
    expect(lookup).not.toHaveBeenCalled()
  })

  it('resolves each allow-listed name to its fixed email only', async () => {
    for (const who of ['guest-1', 'guest-2', 'guest-3']) {
      lookup.mockClear()
      await authorizeDemo(lookup, true, who)
      expect(lookup).toHaveBeenCalledWith(DemoAccounts.resolve(true, who).email)
      expect(lookup.mock.calls[0][0]).toMatch(/@innovator-island\.demo$/)
    }
  })

  it('never signs in the admin without a password, even in demo mode', async () => {
    lookup.mockClear()
    await expect(authorizeDemo(lookup, true, 'admin')).rejects.toThrow(/Unknown demo account/)
    expect(DemoAccounts.isWho('admin')).toBe(false)
    expect(Object.values(DEMO_GUESTS).every((a) => a.role === 'guest')).toBe(true)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('still seeds one admin and three guests', () => {
    expect(Object.values(DEMO_ACCOUNTS).map((a) => a.role).sort()).toEqual(['admin', 'guest', 'guest', 'guest'])
  })
})
