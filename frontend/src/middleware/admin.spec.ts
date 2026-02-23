import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import middleware from './admin'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockUser = ref<{ role?: string } | null>(null)
mockNuxtImport('useUserSession', () => () => ({ user: mockUser }))

const mockNavigateTo = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => mockNavigateTo)

describe('admin middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows admin users', () => {
    mockUser.value = { role: 'admin' }
    middleware({} as any, {} as any)
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('redirects non-admin users', () => {
    mockUser.value = { role: 'user' }
    middleware({} as any, {} as any)
    expect(mockNavigateTo).toHaveBeenCalledWith('/')
  })
})
