import { mountSuspended, renderSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import Page from './index.vue'

const mockNavigateTo = vi.hoisted(() => vi.fn())
const mockLoggedIn = ref(false)

mockNuxtImport('useUserSession', () => () => ({
  loggedIn: mockLoggedIn,
  fetch: vi.fn(),
}))

mockNuxtImport('navigateTo', () => mockNavigateTo)

vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({}))

describe('Page: Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoggedIn.value = false
  })

  it('renders login form', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/login',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })

  it('shows success message after login request', async () => {
    const wrapper = await mountSuspended(Page, {
      route: '/login',
    })

    const input = wrapper.find('input')
    await input.setValue('test@example.com')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('returns to login form on button click', async () => {
    const wrapper = await mountSuspended(Page, {
      route: '/login',
    })

    // Submit form to get to success state
    const input = wrapper.find('input')
    await input.setValue('test@example.com')
    await wrapper.find('form').trigger('submit')

    // Click "back to login" button to return to form
    await wrapper.find('[role="alert"] button').trigger('click')

    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('redirects to home when already logged in', async () => {
    mockLoggedIn.value = true
    await mountSuspended(Page, { route: '/login' })
    expect(mockNavigateTo).toHaveBeenCalledWith('/')
  })
})
