// @vitest-environment node
import '../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import handler from './sync-now.post'

const mockSync = vi.fn()
vi.mock('~~/server/helpers/sync', () => ({ syncDavToSidecar: (...a: unknown[]) => mockSync(...a) }))

const fn = handler as unknown as (e: unknown) => Promise<unknown>
const originalConfig = globalThis.useRuntimeConfig

describe('sync-now.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.useRuntimeConfig = originalConfig
  })

  it('returns 503 when no sync secret is configured', async () => {
    globalThis.useRuntimeConfig = (() => ({ SYNC_SECRET: '' })) as typeof useRuntimeConfig
    await expect(fn({})).rejects.toThrow('Sync not configured')
  })

  it('returns 401 without a matching bearer token', async () => {
    vi.mocked(globalThis.getHeader).mockReturnValue('Bearer wrong')
    await expect(fn({})).rejects.toThrow('Unauthorized')
  })

  it('returns 401 when the authorization header is absent', async () => {
    vi.mocked(globalThis.getHeader).mockReturnValue(undefined)
    await expect(fn({})).rejects.toThrow('Unauthorized')
  })

  it('runs the sync with the correct bearer token', async () => {
    vi.mocked(globalThis.getHeader).mockReturnValue('Bearer test-sync-secret')
    mockSync.mockResolvedValue({ added: 1, updated: 0, deleted: 0 })
    await expect(fn({})).resolves.toStrictEqual({ added: 1, updated: 0, deleted: 0 })
  })
})
