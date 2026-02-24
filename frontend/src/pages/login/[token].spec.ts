import { mountSuspended, renderSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import Page from './[token].vue'
import { describe, expect, it, vi, beforeEach } from 'vitest'

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

vi.stubGlobal('$fetch', mock$fetch)

describe('Page: Login Token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoggedIn.value = false
    mock$fetch.mockResolvedValue({})
  })

  it('renders loading state', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/login/test-token',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })

  it('redirects to home when already logged in', async () => {
    mockLoggedIn.value = true
    await mountSuspended(Page, { route: '/login/test-token' })
    expect(mockNavigateTo).toHaveBeenCalledWith('/')
  })

  it('calls API and navigates on success', async () => {
    mock$fetch.mockResolvedValue({})
    const wrapper = await mountSuspended(Page, { route: '/login/test-token' })
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
    // success is true, so loading spinner is shown
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it('shows error state when API fails', async () => {
    mock$fetch.mockRejectedValue(new Error('Invalid token'))
    const wrapper = await mountSuspended(Page, { route: '/login/bad-token' })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalled()
    })
    // Wait for error state to render
    await vi.waitFor(() => {
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })
  })

  it('navigates home on error button click', async () => {
    mock$fetch.mockRejectedValue(new Error('Invalid token'))
    const wrapper = await mountSuspended(Page, { route: '/login/bad-token' })
    await vi.waitFor(() => {
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })
    mockNavigateTo.mockClear()
    await wrapper.find('button[aria-label="Close"]').trigger('click')
    expect(mockNavigateTo).toHaveBeenCalledWith('/')
  })
})
