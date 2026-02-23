import { renderSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import Page from './[token].vue'
import { describe, expect, it, vi } from 'vitest'

const mockRefreshSession = vi.fn()

mockNuxtImport('useUserSession', () => () => ({
  loggedIn: ref(false),
  fetch: mockRefreshSession,
}))

describe('Page: Login Token', () => {
  it('renders', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/login/test-token',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })
})
