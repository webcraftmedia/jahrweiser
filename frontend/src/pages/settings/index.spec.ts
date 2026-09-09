import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Page from './index.vue'

const mockNavigateTo = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => mockNavigateTo)

describe('Page: Einstellungen (Einstieg)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends /settings straight on to the profile tab', async () => {
    // The route exists only so the sidebar has something to land on; there is
    // no "settings overview" to show.
    await mountSuspended(Page, { route: '/settings' })
    expect(mockNavigateTo).toHaveBeenCalledWith('/settings/profile')
  })
})
