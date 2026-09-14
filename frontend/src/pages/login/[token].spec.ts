import { mountSuspended, renderSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { stubApi } from '../../../test/helpers/stub-api'

import Page from './[token].vue'

const { mockNavigateTo, mock$fetch, mockRefreshSession } = vi.hoisted(() => ({
  mockNavigateTo: vi.fn(),
  mock$fetch: vi.fn(),
  mockRefreshSession: vi.fn(),
}))
const mockLoggedIn = ref(false)

mockNuxtImport('useUserSession', () => () => ({
  loggedIn: mockLoggedIn,
  fetch: mockRefreshSession,
}))

mockNuxtImport('navigateTo', () => mockNavigateTo)

stubApi(mock$fetch)

/** Mount the page and press "Jetzt anmelden" — nothing happens without it. */
async function confirm(route = '/login/test-token') {
  const wrapper = await mountSuspended(Page, { route })
  await wrapper.find('button').trigger('click')
  return wrapper
}

/** A 401 from redeemLoginLink, shaped the way Nitro serialises `data`. */
function rejectWith(reason?: string) {
  mock$fetch.mockRejectedValue(
    Object.assign(new Error('Bad credentials'), {
      data: { statusCode: 401, data: reason === undefined ? undefined : { reason } },
    }),
  )
}

describe('Page: Login Token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoggedIn.value = false
    mock$fetch.mockResolvedValue({})
  })

  it('renders the confirmation step', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/login/test-token',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })

  it('does not redeem the link by merely rendering the page', async () => {
    // The reason this page exists. Corporate mail scanners open incoming links
    // in a headless browser; a redemption on mount is spent before the member
    // ever clicks, and single-use means they are locked out.
    await mountSuspended(Page, { route: '/login/test-token' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mock$fetch).not.toHaveBeenCalled()
  })

  it('redirects to home when already logged in', async () => {
    mockLoggedIn.value = true
    await mountSuspended(Page, { route: '/login/test-token' })
    expect(mockNavigateTo).toHaveBeenCalledWith('/')
  })

  it('redirects to redirect path when already logged in', async () => {
    mockLoggedIn.value = true
    await mountSuspended(Page, { route: '/login/test-token?redirect=/2025/03' })
    expect(mockNavigateTo).toHaveBeenCalledWith('/2025/03')
  })

  it('ignores invalid redirect values when already logged in', async () => {
    mockLoggedIn.value = true
    await mountSuspended(Page, { route: '/login/test-token?redirect=//evil.com' })
    expect(mockNavigateTo).toHaveBeenCalledWith('/')
  })

  it('calls API and navigates on confirmation', async () => {
    const wrapper = await confirm()
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/redeemLoginLink', {
        method: 'POST',
        body: { token: 'test-token' },
      })
    })
    await vi.waitFor(() => {
      expect(mockRefreshSession).toHaveBeenCalled()
    })
    expect(mockNavigateTo).toHaveBeenCalledWith('/')
    // Still pending, so the loading spinner is shown
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it('navigates to redirect path on success', async () => {
    await confirm('/login/test-token?redirect=/2025/03/event/abc')
    await vi.waitFor(() => {
      expect(mockRefreshSession).toHaveBeenCalled()
    })
    expect(mockNavigateTo).toHaveBeenCalledWith('/2025/03/event/abc')
  })

  it('shows error state when API fails', async () => {
    rejectWith()
    const wrapper = await confirm('/login/bad-token')
    await vi.waitFor(() => {
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })
    expect(wrapper.text()).toContain('pages.login.error.text')
  })

  it('names the scanner case when the link was already used', async () => {
    // "Already used" and "expired" call for different reactions, and telling
    // them apart is what would have surfaced the scanner months earlier.
    rejectWith('used')
    const wrapper = await confirm('/login/spent-token')
    await vi.waitFor(() => {
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })
    expect(wrapper.text()).toContain('pages.login.error.used')
  })

  it.each(['expired', 'unknown', 'disabled'])('names the %s case', async (reason) => {
    rejectWith(reason)
    const wrapper = await confirm('/login/some-token')
    await vi.waitFor(() => {
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })
    expect(wrapper.text()).toContain(`pages.login.error.${reason}`)
  })

  it('falls back to the generic message for a reason it does not know', async () => {
    rejectWith('something-new')
    const wrapper = await confirm('/login/some-token')
    await vi.waitFor(() => {
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })
    expect(wrapper.text()).toContain('pages.login.error.text')
  })

  it('navigates home on error button click', async () => {
    rejectWith()
    const wrapper = await confirm('/login/bad-token')
    await vi.waitFor(() => {
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })
    mockNavigateTo.mockClear()
    await wrapper.find('[role="alert"] button').trigger('click')
    expect(mockNavigateTo).toHaveBeenCalledWith('/')
  })
})
