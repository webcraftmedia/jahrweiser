// @vitest-environment node
import '../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import handler from './sync-now.post'

const mockSync = vi.fn()
vi.mock('~~/server/helpers/sync', () => ({ syncDavToSidecar: (...a: unknown[]) => mockSync(...a) }))

const mockRecord = vi.fn()
vi.mock('~~/server/helpers/metrics', () => ({
  recordDailyMetrics: (...a: unknown[]) => mockRecord(...a),
}))

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

  it('records the daily metrics after a successful sync', async () => {
    // The dashboard series rides along with the cron that already runs every
    // ten minutes, rather than getting a schedule of its own.
    vi.mocked(globalThis.getHeader).mockReturnValue('Bearer test-sync-secret')
    mockSync.mockResolvedValue({ added: 0, updated: 0, deleted: 0 })
    await fn({})
    expect(mockRecord).toHaveBeenCalledTimes(1)
  })

  it('still reports the sync as successful when the measurement fails', async () => {
    // A broken metrics write must never make a cron run look failed — the
    // numbers are taken again ten minutes later.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(globalThis.getHeader).mockReturnValue('Bearer test-sync-secret')
    mockSync.mockResolvedValue({ added: 2, updated: 0, deleted: 0 })
    mockRecord.mockRejectedValue(new Error('table missing'))
    await expect(fn({})).resolves.toStrictEqual({ added: 2, updated: 0, deleted: 0 })
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to record daily metrics'),
      expect.anything(),
    )
    consoleSpy.mockRestore()
  })

  it('does not measure when the sync itself was refused', async () => {
    vi.mocked(globalThis.getHeader).mockReturnValue('Bearer wrong')
    await expect(fn({})).rejects.toThrow('Unauthorized')
    expect(mockRecord).not.toHaveBeenCalled()
  })
})
