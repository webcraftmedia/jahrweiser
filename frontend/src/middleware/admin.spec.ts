import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import middleware from './admin'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockUser = ref<{ role?: string } | null>(null)
const mockLoggedIn = ref(true)
mockNuxtImport('useUserSession', () => () => ({
  user: mockUser,
  loggedIn: mockLoggedIn,
  fetch: vi.fn(),
}))

const mockNavigateTo = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => mockNavigateTo)

describe('admin middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows admin users', () => {
    mockUser.value = { role: 'admin' }
    middleware({} as unknown, {} as unknown)
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('redirects non-admin users', () => {
    mockUser.value = { role: 'user' }
    middleware({} as unknown, {} as unknown)
    expect(mockNavigateTo).toHaveBeenCalledWith('/')
  })
})
