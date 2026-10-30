// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { nitro } from '../../test/setup-server'

import handler from './feedback.get'

const fn = handler as unknown as (e: unknown) => Promise<{ enabled: boolean }>

const originalConfig = nitro.useRuntimeConfig

describe('feedback.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(nitro.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'A', email: 'a@x.de', role: 'user' },
    })
  })

  afterEach(() => {
    nitro.useRuntimeConfig = originalConfig
  })

  it('reports feedback as available when an address is configured', async () => {
    await expect(fn({})).resolves.toStrictEqual({ enabled: true })
  })

  it('reports it as unavailable without one', async () => {
    nitro.useRuntimeConfig = () => ({
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
    vi.mocked(nitro.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(fn({})).rejects.toThrow('Unauthorized')
  })
})
