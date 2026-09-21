// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import handler from './feedback.get'

const fn = handler as unknown as (e: unknown) => Promise<{ enabled: boolean }>

const originalConfig = globalThis.useRuntimeConfig

describe('feedback.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'A', email: 'a@x.de', role: 'user' },
    })
  })

  afterEach(() => {
    globalThis.useRuntimeConfig = originalConfig
  })

  it('reports feedback as available when an address is configured', async () => {
    await expect(fn({})).resolves.toStrictEqual({ enabled: true })
  })

  it('reports it as unavailable without one', async () => {
    globalThis.useRuntimeConfig = () => ({
      FEEDBACK_EMAIL: '',
    })
    await expect(fn({})).resolves.toStrictEqual({ enabled: false })
  })

  it('never hands out the address itself', async () => {
    // A private inbox behind an authenticated endpoint is still not something
    // the form needs — it only needs to know whether to offer a textarea.
    expect(JSON.stringify(await fn({}))).not.toContain('@')
  })

  it('requires a session', async () => {
    vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(fn({})).rejects.toThrow('Unauthorized')
  })
})
