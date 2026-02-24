import { mountSuspended, renderSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import Page from './index.vue'
import { describe, expect, it, vi } from 'vitest'

mockNuxtImport('useUserSession', () => () => ({
  loggedIn: ref(false),
  fetch: vi.fn(),
}))

vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({}))

describe('Page: Login', () => {
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

    // Click dismiss button to return to form
    await wrapper.find('button[aria-label="Close"]').trigger('click')

    expect(wrapper.find('form').exists()).toBe(true)
  })
})
