import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import middleware from './authenticated'

const mockLoggedIn = ref(false)
mockNuxtImport('useUserSession', () => () => ({
  loggedIn: mockLoggedIn,
  fetch: vi.fn(),
}))

const mockNavigateTo = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => mockNavigateTo)

describe('authenticated middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoggedIn.value = false
  })

  it('allows authenticated users', () => {
    mockLoggedIn.value = true
    middleware({ path: '/2025/03' } as unknown, {} as unknown)
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('redirects to /login with redirect query for non-root paths', () => {
    middleware({ path: '/2025/03/event/abc' } as unknown, {} as unknown)
    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/2025/03/event/abc' },
    })
  })

  it('redirects to /login without redirect query for root path', () => {
    middleware({ path: '/' } as unknown, {} as unknown)
    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: '/login',
      query: undefined,
    })
  })
})
