import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { markEmailNotFound, isEmailNotFound, clearEmailNotFound } from './negativeCache'

const NOW = 1_700_000_000_000
const TTL_MS = 5 * 60 * 1000

describe('negativeCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    // Leave no entries behind for the next test (module state is shared).
    clearEmailNotFound('a@example.com')
    clearEmailNotFound('b@example.com')
    vi.useRealTimers()
  })

  it('reports unknown emails as not cached', () => {
    expect(isEmailNotFound('a@example.com')).toBe(false)
  })

  it('remembers a not-found email within the TTL', () => {
    markEmailNotFound('a@example.com')
    vi.setSystemTime(NOW + TTL_MS - 1000)
    expect(isEmailNotFound('a@example.com')).toBe(true)
  })

  it('evicts an entry once the TTL has passed', () => {
    markEmailNotFound('a@example.com')
    vi.setSystemTime(NOW + TTL_MS + 1)
    expect(isEmailNotFound('a@example.com')).toBe(false)
  })

  it('clearEmailNotFound drops the entry immediately', () => {
    markEmailNotFound('a@example.com')
    clearEmailNotFound('a@example.com')
    expect(isEmailNotFound('a@example.com')).toBe(false)
  })

  it('keys are independent per email', () => {
    markEmailNotFound('a@example.com')
    expect(isEmailNotFound('b@example.com')).toBe(false)
    clearEmailNotFound('a@example.com')
    expect(isEmailNotFound('a@example.com')).toBe(false)
  })
})
