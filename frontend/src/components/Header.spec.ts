import { renderSuspended, mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import Component from './Header.vue'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockClear = vi.fn()

mockNuxtImport('useUserSession', () => () => ({
  loggedIn: ref(true),
  user: ref({ name: 'Test User', email: 'test@example.com', role: 'admin' }),
  clear: mockClear,
}))

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders', async () => {
    const html = await (await renderSuspended(Component)).html()
    expect(html).toMatchSnapshot()
  })

  it('toggles mobile menu', async () => {
    const wrapper = await mountSuspended(Component)
    const burger = wrapper.find('[aria-controls="navbar-mobile"]')

    expect(wrapper.find('#navbar-mobile').classes()).toContain('hidden')

    await burger.trigger('click')
    expect(wrapper.find('#navbar-mobile').classes()).not.toContain('hidden')

    await burger.trigger('click')
    expect(wrapper.find('#navbar-mobile').classes()).toContain('hidden')
  })

  it('logs out', async () => {
    const wrapper = await mountSuspended(Component)
    const logoutButton = wrapper.find('#navbar-desktop button')
    await logoutButton.trigger('click')

    expect(mockClear).toHaveBeenCalled()
  })
})
