// @vitest-environment node
import '../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import handler from './metrics.get'

const mockCurrent = vi.fn()
const mockSeries = vi.fn()
vi.mock('~~/server/helpers/metrics', () => ({
  collectCurrentMetrics: (...args: unknown[]) => mockCurrent(...args),
  buildMonthlySeries: (...args: unknown[]) => mockSeries(...args),
}))

const fn = handler as unknown as (event: unknown) => Promise<unknown>

const CURRENT = {
  members: 42,
  newsletterSubscribed: 37,
  newsletterUnsubscribed: 5,
  telegramChannels: 4,
  blaettchenIssues: 12,
}
const MONTHS = [
  {
    month: '2026-09',
    members: 42,
    derived: false,
    newsletterSubscribed: 37,
    newsletterUnsubscribed: 5,
  },
]

describe('admin/metrics.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrent.mockResolvedValue(CURRENT)
    mockSeries.mockResolvedValue(MONTHS)
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' },
    })
  })

  it('refuses a member — how many people opted out is nobody else’s business', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'User', email: 'user@example.com', role: 'user' },
    })
    await expect(fn({})).rejects.toThrow('Not Authorized')
    expect(mockCurrent).not.toHaveBeenCalled()
  })

  it('refuses an anonymous request', async () => {
    vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(fn({})).rejects.toThrow('Unauthorized')
  })

  it('answers with the current numbers and the monthly series', async () => {
    await expect(fn({})).resolves.toStrictEqual({ current: CURRENT, months: MONTHS })
  })

  it('passes the configured paths on, so the tiles count the right directory', async () => {
    await fn({})
    expect(mockCurrent).toHaveBeenCalledWith(
      expect.objectContaining({ BLAETTCHEN_DIR: expect.any(String) }),
    )
  })
})
