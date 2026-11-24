// @vitest-environment edge-runtime
import aggregateTest from '@convex-dev/aggregate/test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import workflowTest from '@convex-dev/workflow/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'

const modules = import.meta.glob('../../convex/**/*.ts')
const GUEST = '3f2a9c1e-7b4d-4e8a-9c6f-1d2e3f4a5b6c'
const OTHER = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
const HOUR = 60 * 60 * 1000

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function seeded() {
  const t = convexTest(schema, modules)
  aggregateTest.register(t, 'parkStats')
  rateLimiterTest.register(t, 'rateLimiter')
  workflowTest.register(t, 'workflow')
  await t.mutation(internal.seed.run, {})
  return t
}

const store = (t: Awaited<ReturnType<typeof seeded>>, type: string, bytes: number) =>
  t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })))

describe('photos', () => {
  it('rate limits upload URLs per guest', async () => {
    const t = await seeded()
    for (let i = 0; i < 3; i++) await t.mutation(api.photos.generateUploadUrl, { guestId: GUEST })
    await expect(t.mutation(api.photos.generateUploadUrl, { guestId: GUEST })).rejects.toThrow()
    // Another guest has their own bucket.
    await t.mutation(api.photos.generateUploadUrl, { guestId: OTHER })
  })

  it('rejects a bad guest id, including a long guessable one', async () => {
    const t = await seeded()
    await expect(t.mutation(api.photos.generateUploadUrl, { guestId: 'short' })).rejects.toThrow(/BadGuestId/)
    await expect(t.mutation(api.photos.generateUploadUrl, { guestId: 'aaaaaaaaaaaaaaaa' })).rejects.toThrow(/BadGuestId/)
    expect(await t.query(api.photos.forGuest, { guestId: 'aaaaaaaaaaaaaaaa' })).toEqual([])
  })

  it('limits upload URLs across all guests, so fresh guest ids do not get unlimited buckets', async () => {
    const t = await seeded()
    for (let i = 0; i < 60; i++) await t.mutation(api.photos.generateUploadUrl, { guestId: crypto.randomUUID() })
    await expect(t.mutation(api.photos.generateUploadUrl, { guestId: crypto.randomUUID() })).rejects.toThrow()
  })

  it('submit is idempotent per storage id', async () => {
    const t = await seeded()
    const storageId = await store(t, 'image/png', 200)
    const args = { guestId: GUEST, parkSlug: 'innovator-island', storageId }
    const first = await t.mutation(api.photos.submit, args)
    const second = await t.mutation(api.photos.submit, args)
    if (!first.ok || !second.ok) throw new Error('expected ok')
    expect(second.photoId).toBe(first.photoId)
    expect(await t.run((ctx) => ctx.db.query('photos').collect())).toHaveLength(1)
    // Someone else cannot attach to a file they did not upload.
    expect(await t.mutation(api.photos.submit, { ...args, guestId: OTHER })).toEqual({ ok: false, code: 'NotAnImage' })
  })

  it('sweeps old blobs that no photo uses, and keeps referenced and young ones', async () => {
    const t = await seeded()
    const used = await store(t, 'image/png', 200)
    const result = await t.mutation(api.photos.submit, { guestId: GUEST, parkSlug: 'innovator-island', storageId: used })
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
    const storageId = await store(t, 'image/png', 200)
    const result = await t.mutation(api.photos.submit, { guestId: GUEST, parkSlug: 'innovator-island', storageId })
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
    const storageId = await store(t, 'application/pdf', 100)
    expect(await t.mutation(api.photos.submit, { guestId: GUEST, parkSlug: 'innovator-island', storageId })).toEqual({ ok: false, code: 'NotAnImage' })
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull()
  })

  it('rejects files that are too large', async () => {
    const t = await seeded()
    const storageId = await store(t, 'image/png', 5 * 1024 * 1024 + 1)
    expect(await t.mutation(api.photos.submit, { guestId: GUEST, parkSlug: 'innovator-island', storageId })).toEqual({ ok: false, code: 'UploadTooLarge' })
  })

  it('accepts a good image, records it and starts the workflow', async () => {
    const t = await seeded()
    const storageId = await store(t, 'image/png', 200)
    const result = await t.mutation(api.photos.submit, { guestId: GUEST, parkSlug: 'innovator-island', storageId })
    if (!result.ok) throw new Error('expected ok')
    const photoId = result.photoId
    const photos = await t.query(api.photos.forGuest, { guestId: GUEST })
    expect(photos).toEqual([expect.objectContaining({ id: photoId, status: 'uploaded', url: null })])
    expect(await t.query(api.photos.forGuest, { guestId: OTHER })).toEqual([])
  })

  it('marks the photo failed with the error tag and clears the blobs when the workflow fails', async () => {
    const t = await seeded()
    const storageId = await store(t, 'image/png', 200)
    const result = await t.mutation(api.photos.submit, { guestId: GUEST, parkSlug: 'innovator-island', storageId })
    if (!result.ok) throw new Error('expected ok')
    const photoId = result.photoId
    await t.mutation(internal.photos.onWorkflowComplete, {
      workflowId: 'wf' as never,
      result: { kind: 'failed', error: 'ChromaKeyFailed: No green screen found.' },
      context: { photoId },
    })
    const [photo] = await t.query(api.photos.forGuest, { guestId: GUEST })
    expect(photo).toMatchObject({ status: 'failed', failure: 'ChromaKeyFailed' })
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull()
  })
})
