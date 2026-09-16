import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { createUnauthorizedHandler } from './auth-redirect'

const mockNavigateTo = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => mockNavigateTo)

/**
 * The handler is built here instead of being fished out of a fake
 * `$fetch.create`: since Nuxt 4.5 the plugin's `$fetch` is a snapshot taken when
 * its module was first evaluated, so a `globalThis.$fetch` swapped in from a
 * `beforeEach` is no longer the object the plugin talks to — the old setup
 * captured nothing and the spec died on it. Whether the handler really reaches
 * the client the app calls is asserted in a browser instead, see
 * e2e/auth-redirect.spec.ts.
 */
describe('auth-redirect: 401 handling', () => {
  const clear = vi.fn()
  let handle: ReturnType<typeof createUnauthorizedHandler>

  function atPath(pathname: string) {
    Object.defineProperty(window, 'location', { value: { pathname }, writable: true })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    handle = createUnauthorizedHandler(clear)
  })

  it('redirects to login on 401 with redirect query from current path', async () => {
    atPath('/2025/03')
    await handle({ request: '/api/calendars', response: { status: 401 } })
    expect(clear).toHaveBeenCalled()
    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/2025/03' },
    })
  })

  it('redirects to login without redirect when on root path', async () => {
    atPath('/')
    await handle({ request: '/api/calendars', response: { status: 401 } })
    expect(clear).toHaveBeenCalled()
    expect(mockNavigateTo).toHaveBeenCalledWith({ path: '/login', query: undefined })
  })

  it('redirects to login without redirect when on login path', async () => {
    atPath('/login')
    await handle({ request: '/api/calendars', response: { status: 401 } })
    expect(clear).toHaveBeenCalled()
    expect(mockNavigateTo).toHaveBeenCalledWith({ path: '/login', query: undefined })
  })

  it('does not redirect on other status codes', async () => {
    await handle({ request: '/api/calendars', response: { status: 500 } })
    expect(clear).not.toHaveBeenCalled()
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('does not redirect on 401 from redeemLoginLink', async () => {
    // That endpoint answers 401 for a bad token — logging the visitor out and
    // bouncing them to /login is exactly where they already are.
    await handle({ request: '/api/redeemLoginLink', response: { status: 401 } })
    expect(clear).not.toHaveBeenCalled()
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('handles URL object as request', async () => {
    atPath('/2025/06')
    await handle({ request: new URL('http://localhost/api/calendars'), response: { status: 401 } })
    expect(clear).toHaveBeenCalled()
    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/2025/06' },
    })
  })

  it('handles Request object', async () => {
    atPath('/2025/06')
    await handle({ request: new Request('http://localhost/api/event'), response: { status: 401 } })
    expect(clear).toHaveBeenCalled()
    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/2025/06' },
    })
  })
})
