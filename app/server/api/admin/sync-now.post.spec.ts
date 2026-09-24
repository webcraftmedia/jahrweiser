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

const mockPrune = vi.fn()
vi.mock('~~/server/helpers/events', () => ({
  pruneUserEvents: (...a: unknown[]) => mockPrune(...a),
}))

const fn = handler as unknown as (e: unknown) => Promise<unknown>
const originalConfig = globalThis.useRuntimeConfig

describe('sync-now.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.useRuntimeConfig = originalConfig
    mockPrune.mockResolvedValue({ deleted: 0, anonymised: 0 })
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

  it('still measures when the sync fails, and still reports the failure', async () => {
    // The measurement reads the sidecar, which is perfectly readable while DAV
    // is unreachable. Tying it to a successful sync is what silently took the
    // whole metrics series down for five days when the sync started throwing.
    vi.mocked(globalThis.getHeader).mockReturnValue('Bearer test-sync-secret')
    mockSync.mockRejectedValue(new Error('DAV unreachable'))
    await expect(fn({})).rejects.toThrow('DAV unreachable')
    expect(mockRecord).toHaveBeenCalledTimes(1)
  })

  it('does not measure when the sync itself was refused', async () => {
    vi.mocked(globalThis.getHeader).mockReturnValue('Bearer wrong')
    await expect(fn({})).rejects.toThrow('Unauthorized')
    expect(mockRecord).not.toHaveBeenCalled()
    expect(mockPrune).not.toHaveBeenCalled()
  })

  it('says what the retention sweep forgot, when it forgot something', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(globalThis.getHeader).mockReturnValue('Bearer test-sync-secret')
    mockSync.mockResolvedValue({ added: 0, updated: 0, deleted: 0 })
    mockPrune.mockResolvedValue({ deleted: 4, anonymised: 9 })

    await fn({})

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('pruned 4 event(s)'))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('origin on 9'))
    consoleSpy.mockRestore()
  })

  it('stays quiet on a sweep with nothing to do', async () => {
    // It runs every ten minutes; a line each time would drown the log it is
    // supposed to keep readable.
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(globalThis.getHeader).mockReturnValue('Bearer test-sync-secret')
    mockSync.mockResolvedValue({ added: 0, updated: 0, deleted: 0 })

    await fn({})

    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('still reports the sync as successful when the sweep fails', async () => {
    // A deletion obligation that cannot be met is an operator problem, not a
    // reason to mark the cron run failed — it retries in ten minutes.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(globalThis.getHeader).mockReturnValue('Bearer test-sync-secret')
    mockSync.mockResolvedValue({ added: 3, updated: 0, deleted: 0 })
    mockPrune.mockRejectedValue(new Error('table missing'))

    await expect(fn({})).resolves.toStrictEqual({ added: 3, updated: 0, deleted: 0 })
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to prune user events'),
      expect.anything(),
    )
    consoleSpy.mockRestore()
  })

  it('still forgets while DAV is down', async () => {
    // The sweep reads and writes the sidecar only. Tying it to a healthy DAV
    // would pause the deletion obligation for as long as a server is offline.
    vi.mocked(globalThis.getHeader).mockReturnValue('Bearer test-sync-secret')
    mockSync.mockRejectedValue(new Error('DAV unreachable'))
    await expect(fn({})).rejects.toThrow('DAV unreachable')
    expect(mockPrune).toHaveBeenCalledTimes(1)
  })
})
