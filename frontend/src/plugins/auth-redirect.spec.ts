import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'

import plugin from './auth-redirect'

const mockClear = vi.fn()
mockNuxtImport('useUserSession', () => () => ({
  ready: computed(() => true),
  loggedIn: computed(() => false),
  user: computed(() => null),
  session: ref(null),
  fetch: vi.fn(),
  openInPopup: vi.fn(),
  clear: mockClear,
}))

const mockNavigateTo = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => mockNavigateTo)

type ResponseErrorHandler = (ctx: {
  request: string | URL | Request
  response: { status: number }
}) => Promise<void>

describe('auth-redirect plugin', () => {
  let capturedHandler: ResponseErrorHandler

  beforeEach(() => {
    vi.clearAllMocks()

    const createdFetch = vi.fn()

    globalThis.$fetch = Object.assign(vi.fn(), {
      create: vi.fn((opts: { onResponseError: ResponseErrorHandler }) => {
        capturedHandler = opts.onResponseError
        return createdFetch
      }),
    }) as unknown as typeof $fetch

    // Run plugin
    ;(plugin as () => void)()
  })

  afterEach(() => {
    // Reset $fetch to a plain mock so Nuxt re-initialization doesn't
    // re-enter the plugin's create branch
    globalThis.$fetch = vi.fn() as unknown as typeof $fetch
  })

  it('replaces $fetch via create', () => {
    expect(capturedHandler).toBeDefined()
  })

  it('redirects to login on 401 with redirect query from current path', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/2025/03' },
      writable: true,
    })
    await capturedHandler({ request: '/api/calendars', response: { status: 401 } })
    expect(mockClear).toHaveBeenCalled()
    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/2025/03' },
    })
  })

  it('redirects to login without redirect when on root path', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/' },
      writable: true,
    })
    await capturedHandler({ request: '/api/calendars', response: { status: 401 } })
    expect(mockClear).toHaveBeenCalled()
    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: '/login',
      query: undefined,
    })
  })

  it('redirects to login without redirect when on login path', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/login' },
      writable: true,
    })
    await capturedHandler({ request: '/api/calendars', response: { status: 401 } })
    expect(mockClear).toHaveBeenCalled()
    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: '/login',
      query: undefined,
    })
  })

  it('does not redirect on other status codes', async () => {
    await capturedHandler({ request: '/api/calendars', response: { status: 500 } })
    expect(mockClear).not.toHaveBeenCalled()
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('does not redirect on 401 from redeemLoginLink', async () => {
    await capturedHandler({ request: '/api/redeemLoginLink', response: { status: 401 } })
    expect(mockClear).not.toHaveBeenCalled()
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('handles URL object as request', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/2025/06' },
      writable: true,
    })
    await capturedHandler({
      request: new URL('http://localhost/api/calendars'),
      response: { status: 401 },
    })
    expect(mockClear).toHaveBeenCalled()
    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/2025/06' },
    })
  })

  it('handles Request object', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/2025/06' },
      writable: true,
    })
    await capturedHandler({
      request: new Request('http://localhost/api/event'),
      response: { status: 401 },
    })
    expect(mockClear).toHaveBeenCalled()
    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/2025/06' },
    })
  })

  it('skips when $fetch.create is not available', () => {
    globalThis.$fetch = vi.fn() as unknown as typeof $fetch
    ;(plugin as () => void)()
    // Should not throw
    expect(mockClear).not.toHaveBeenCalled()
  })
})
