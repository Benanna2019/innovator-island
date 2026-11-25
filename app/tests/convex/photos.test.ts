// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import { seeded, signedIn } from './helpers'
import type { Tester } from './helpers'

const HOUR = 60 * 60 * 1000

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const store = (t: Tester, type: string, bytes: number) => t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })))
const PARK = 'innovator-island'

describe('photos', () => {
  it('needs a login to get an upload URL or submit a file', async () => {
    const t = await seeded()
    await expect(t.mutation(api.photos.generateUploadUrl, {})).rejects.toThrow(/Unauthenticated/)
    const storageId = await store(t, 'image/png', 200)
    await expect(t.mutation(api.photos.submit, { parkSlug: PARK, storageId })).rejects.toThrow(/Unauthenticated/)
    expect(await t.query(api.photos.mine, {})).toEqual([])
  })

  it('rate limits upload URLs per user', async () => {
    const t = await seeded()
    const a = await signedIn(t, 'guest', 'a@example.test')
    const b = await signedIn(t, 'guest', 'b@example.test')
    for (let i = 0; i < 3; i++) await a.as.mutation(api.photos.generateUploadUrl, {})
    await expect(a.as.mutation(api.photos.generateUploadUrl, {})).rejects.toThrow()
    // Another user has their own bucket.
    await b.as.mutation(api.photos.generateUploadUrl, {})
  })

  it('limits upload URLs across all users, so new accounts do not get unlimited buckets', async () => {
    const t = await seeded()
    for (let i = 0; i < 20; i++) {
      const user = await signedIn(t, 'guest', `u${i}@example.test`)
      await user.as.mutation(api.photos.generateUploadUrl, {})
    }
    const extra = await signedIn(t, 'guest', 'extra@example.test')
    await expect(extra.as.mutation(api.photos.generateUploadUrl, {})).rejects.toThrow()
  })

  it('submit is idempotent per storage id and only for the owner', async () => {
    const t = await seeded()
    const me = await signedIn(t, 'guest', 'me@example.test')
    const other = await signedIn(t, 'guest', 'other@example.test')
    const storageId = await store(t, 'image/png', 200)
    const args = { parkSlug: PARK, storageId }
    const first = await me.as.mutation(api.photos.submit, args)
    const second = await me.as.mutation(api.photos.submit, args)
    if (!first.ok || !second.ok) throw new Error('expected ok')
    expect(second.photoId).toBe(first.photoId)
    expect(await t.run((ctx) => ctx.db.query('photos').collect())).toHaveLength(1)
    // Someone else cannot attach to a file they did not upload.
    expect(await other.as.mutation(api.photos.submit, args)).toEqual({ ok: false, code: 'NotAnImage' })
  })

  it('sweeps old blobs that no photo uses, and keeps referenced and young ones', async () => {
    const t = await seeded()
    const me = await signedIn(t, 'guest')
    const used = await store(t, 'image/png', 200)
    const result = await me.as.mutation(api.photos.submit, { parkSlug: PARK, storageId: used })
    if (!result.ok) throw new Error('expected ok')
    const orphan = await store(t, 'image/png', 200)
    vi.setSystemTime(Date.now() + 2 * HOUR)
    const young = await store(t, 'image/png', 200)

    expect(await t.mutation(internal.photos.sweepOrphans, {})).toBe(1)
    expect(await t.run((ctx) => ctx.db.system.get(orphan))).toBeNull()
    expect(await t.run((ctx) => ctx.db.system.get(used))).not.toBeNull()
    expect(await t.run((ctx) => ctx.db.system.get(young))).not.toBeNull()
  })

  it('sweeps a blob that only an intermediate step stored', async () => {
    const t = await seeded()
    const me = await signedIn(t, 'guest')
    const storageId = await store(t, 'image/png', 200)
    const result = await me.as.mutation(api.photos.submit, { parkSlug: PARK, storageId })
    if (!result.ok) throw new Error('expected ok')
    const kept = await store(t, 'image/png', 200)
    const lost = await store(t, 'image/png', 200)
    await t.mutation(internal.photos.progress, { photoId: result.photoId, keyedId: kept })
    vi.setSystemTime(Date.now() + 2 * HOUR)
    await t.mutation(internal.photos.sweepOrphans, {})
    expect(await t.run((ctx) => ctx.db.system.get(kept))).not.toBeNull()
    expect(await t.run((ctx) => ctx.db.system.get(lost))).toBeNull()
  })

  it('rejects files that are not images, and deletes them', async () => {
    const t = await seeded()
    const me = await signedIn(t, 'guest')
    const storageId = await store(t, 'application/pdf', 100)
    expect(await me.as.mutation(api.photos.submit, { parkSlug: PARK, storageId })).toEqual({ ok: false, code: 'NotAnImage' })
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull()
  })

  it('rejects files that are too large', async () => {
    const t = await seeded()
    const me = await signedIn(t, 'guest')
    const storageId = await store(t, 'image/png', 5 * 1024 * 1024 + 1)
    expect(await me.as.mutation(api.photos.submit, { parkSlug: PARK, storageId })).toEqual({ ok: false, code: 'UploadTooLarge' })
  })

  it('accepts a good image, records it for the user and starts the workflow', async () => {
    const t = await seeded()
    const me = await signedIn(t, 'guest', 'me@example.test')
    const other = await signedIn(t, 'guest', 'other@example.test')
    const storageId = await store(t, 'image/png', 200)
    const result = await me.as.mutation(api.photos.submit, { parkSlug: PARK, storageId })
    if (!result.ok) throw new Error('expected ok')
    expect(await me.as.query(api.photos.mine, {})).toEqual([expect.objectContaining({ id: result.photoId, status: 'uploaded', url: null })])
    expect(await other.as.query(api.photos.mine, {})).toEqual([])
    const row = await t.run((ctx) => ctx.db.get(result.photoId))
    expect(row?.userId).toBe(me.userId)
  })

  it('marks the photo failed with the error tag and clears the blobs when the workflow fails', async () => {
    const t = await seeded()
    const me = await signedIn(t, 'guest')
    const storageId = await store(t, 'image/png', 200)
    const result = await me.as.mutation(api.photos.submit, { parkSlug: PARK, storageId })
    if (!result.ok) throw new Error('expected ok')
    await t.mutation(internal.photos.onWorkflowComplete, {
      workflowId: 'wf' as never,
      result: { kind: 'failed', error: 'ChromaKeyFailed: No green screen found.' },
      context: { photoId: result.photoId },
    })
    const [photo] = await me.as.query(api.photos.mine, {})
    expect(photo).toMatchObject({ status: 'failed', failure: 'ChromaKeyFailed' })
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull()
  })

  it('refuses a blob that already belongs to another photo at any stage', async () => {
    const t = await seeded()
    const me = await signedIn(t, 'guest', 'me@example.test')
    const other = await signedIn(t, 'guest', 'other@example.test')
    const first = await me.as.mutation(api.photos.submit, { parkSlug: PARK, storageId: await store(t, 'image/png', 200) })
    if (!first.ok) throw new Error('expected ok')
    for (const field of ['keyedId', 'composedId', 'finalId'] as const) {
      const blob = await store(t, 'image/png', 200)
      await t.run((ctx) => ctx.db.patch(first.photoId, { [field]: blob }))
      expect(await other.as.mutation(api.photos.submit, { parkSlug: PARK, storageId: blob }), field).toEqual({ ok: false, code: 'NotAnImage' })
    }
    expect(await t.run((ctx) => ctx.db.query('photos').collect())).toHaveLength(1)
  })

  it('caps the photos a user can have in flight, for upload URLs and for submit', async () => {
    const t = await seeded()
    const me = await signedIn(t, 'guest')
    for (let i = 0; i < 3; i++) {
      const result = await me.as.mutation(api.photos.submit, { parkSlug: PARK, storageId: await store(t, 'image/png', 200) })
      expect(result.ok).toBe(true)
    }
    await expect(me.as.mutation(api.photos.generateUploadUrl, {})).rejects.toThrow(/RateLimited/)
    const extra = await store(t, 'image/png', 200)
    expect(await me.as.mutation(api.photos.submit, { parkSlug: PARK, storageId: extra })).toEqual({ ok: false, code: 'RateLimited' })
    expect(await t.run((ctx) => ctx.db.system.get(extra))).toBeNull()
    // Finished photos no longer count.
    const [row] = await t.run((ctx) => ctx.db.query('photos').collect())
    await t.run((ctx) => ctx.db.patch(row._id, { status: 'ready' }))
    await me.as.mutation(api.photos.generateUploadUrl, {})
  })

  it('stops upload URLs for everyone once the daily cap is spent', async () => {
    const t = await seeded()
    // 20 a minute is allowed, so spread the requests out, each from a fresh user, and expect a refusal near 300.
    let granted = 0
    let refused = false
    for (let i = 0; i < 320 && !refused; i++) {
      if (i % 20 === 0) vi.setSystemTime(Date.now() + 60 * 1000)
      const user = await signedIn(t, 'guest', `d${i}@example.test`)
      try {
        await user.as.mutation(api.photos.generateUploadUrl, {})
        granted++
      } catch {
        refused = true
      }
    }
    expect(refused).toBe(true)
    expect(granted).toBeGreaterThanOrEqual(300)
    expect(granted).toBeLessThan(310)
  })
})
