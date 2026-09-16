// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { isWithinLoginCooldown, markLoginRequested } from './loginCooldown'

const NOW = 1_700_000_000_000
const WINDOW_MS = 60_000

describe('loginCooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    // Module state is shared across tests: run every address past the window.
    vi.setSystemTime(NOW + WINDOW_MS * 10)
    isWithinLoginCooldown('a@example.com', WINDOW_MS)
    isWithinLoginCooldown('b@example.com', WINDOW_MS)
    vi.useRealTimers()
  })

  it('reports an address that never asked as free to ask', () => {
    expect(isWithinLoginCooldown('a@example.com', WINDOW_MS)).toBe(false)
  })

  it('holds an address inside the window', () => {
    markLoginRequested('a@example.com')
    vi.setSystemTime(NOW + WINDOW_MS - 1)
    expect(isWithinLoginCooldown('a@example.com', WINDOW_MS)).toBe(true)
  })

  it('releases the address once the window has passed', () => {
    markLoginRequested('a@example.com')
    vi.setSystemTime(NOW + WINDOW_MS)
    expect(isWithinLoginCooldown('a@example.com', WINDOW_MS)).toBe(false)
  })

  it('keeps addresses apart', () => {
    markLoginRequested('a@example.com')
    expect(isWithinLoginCooldown('b@example.com', WINDOW_MS)).toBe(false)
  })

  it('does not care whether the address belongs to anyone', () => {
    // The whole reason this lives outside the database: answering "you are in
    // the cooldown" only for real members would turn the response into an
    // existence oracle. Nothing here can tell the two apart.
    markLoginRequested('nobody@example.com')
    expect(isWithinLoginCooldown('nobody@example.com', WINDOW_MS)).toBe(true)
  })
})
