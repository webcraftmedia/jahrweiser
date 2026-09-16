import { describe, it, expect } from 'vitest'

import { nextExpiry, IDLE_TTL_MS, ABSOLUTE_TTL_MS } from './sessionTtl'

describe('nextExpiry (sliding session policy)', () => {
  const createdAt = 1_700_000_000_000

  it('slides the idle window forward from now for a young session', () => {
    const now = createdAt + 60_000 // a minute after login
    expect(nextExpiry(now, createdAt)).toBe(now + IDLE_TTL_MS)
  })

  it('clamps to the absolute cap when the idle window would overshoot it', () => {
    // Close to the cap: now + idle window would exceed createdAt + absolute cap.
    const now = createdAt + ABSOLUTE_TTL_MS - 1000
    expect(nextExpiry(now, createdAt)).toBe(createdAt + ABSOLUTE_TTL_MS)
  })

  it('returns a past timestamp once the absolute cap is exceeded', () => {
    const now = createdAt + ABSOLUTE_TTL_MS + IDLE_TTL_MS
    const result = nextExpiry(now, createdAt)
    expect(result).toBe(createdAt + ABSOLUTE_TTL_MS)
    expect(result).toBeLessThan(now) // -> middleware treats the session as expired
  })
})
