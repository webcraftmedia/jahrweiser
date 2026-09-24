import { mountSuspended, renderSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

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
    // What a successful redemption looks like from the client's side: the
    // cookie was set, so re-reading the session turns `loggedIn` true.
    mockRefreshSession.mockImplementation(async () => {
      mockLoggedIn.value = true
    })
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
        // The deadline's cancel handle — without it a stalled request stays on
        // the wire after the page has given up on it.
        signal: expect.any(AbortSignal),
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

  it('sends the member to the login form on error button click', async () => {
    // Every error message here ends in "fordere dir einen neuen an", and the
    // form that does it is on /login — going to / and relying on the
    // authenticated middleware to bounce them there is a detour.
    rejectWith()
    const wrapper = await confirm('/login/bad-token')
    await vi.waitFor(() => {
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })
    mockNavigateTo.mockClear()
    await wrapper.find('[data-action="back"]').trigger('click')
    expect(mockNavigateTo).toHaveBeenCalledWith('/login')
  })

  describe('when the session does not survive the redemption', () => {
    // The POST succeeded, so the token is spent — but the browser kept no
    // cookie (mail-app browser, blocked cookies, a device clock far off). The
    // old code navigated anyway, the middleware bounced the member back to the
    // login form, and nothing on screen said why. One link less, every time.
    beforeEach(() => {
      mockRefreshSession.mockImplementation(async () => {
        mockLoggedIn.value = false
      })
    })

    it('explains it instead of navigating', async () => {
      const wrapper = await confirm()
      await vi.waitFor(() => {
        expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      })
      expect(wrapper.text()).toContain('pages.login.error.nosession')
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })

    it('offers no retry — the token is already spent', async () => {
      const wrapper = await confirm()
      await vi.waitFor(() => {
        expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      })
      expect(wrapper.find('[data-action="retry"]').exists()).toBe(false)
    })
  })

  describe('when the server never answers', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      mock$fetch.mockReturnValue(new Promise(() => {}))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    /** Click, then let the 15s deadline pass. */
    async function timeOut() {
      const wrapper = await mountSuspended(Page, { route: '/login/test-token' })
      await wrapper.find('button').trigger('click')
      await vi.advanceTimersByTimeAsync(15_000)
      return wrapper
    }

    it('shows an error rather than loading forever', async () => {
      // The reported symptom: three dots and no way forward, because `fetch`
      // has no timeout and the pending state had no exit.
      const wrapper = await timeOut()
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('pages.login.error.timeout')
    })

    it('offers a retry, because the token may never have been spent', async () => {
      const wrapper = await timeOut()
      mock$fetch.mockResolvedValue({})
      await wrapper.find('[data-action="retry"]').trigger('click')
      await vi.advanceTimersByTimeAsync(0)
      expect(mockRefreshSession).toHaveBeenCalled()
      expect(mockNavigateTo).toHaveBeenCalledWith('/')
    })
  })
})
