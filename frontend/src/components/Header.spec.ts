import { renderSuspended, mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import Component from './Header.vue'

const mockZoomState = vi.hoisted(() => {
  const { ref, computed } = require('vue')
  const zoomLevel = ref(1.0)
  return { zoomLevel, computed }
})

vi.mock('../composables/useZoom', () => ({
  useZoom: () => ({
    zoomLevel: mockZoomState.zoomLevel,
    chromeZoom: mockZoomState.computed(
      () => 1 + (mockZoomState.zoomLevel.value - 1) * 0.3,
    ),
  }),
}))

const { mockClear, mockNavigateTo } = vi.hoisted(() => ({
  mockClear: vi.fn(),
  mockNavigateTo: vi.fn(),
}))
const mockUser = ref<{ name?: string; email?: string; role?: string } | null>({
  name: 'Test User',
  email: 'test@example.com',
  role: 'admin',
})
const mockLoggedIn = ref(true)

mockNuxtImport('useUserSession', () => () => ({
  loggedIn: mockLoggedIn,
  user: mockUser,
  clear: mockClear,
  fetch: vi.fn(),
}))

mockNuxtImport('navigateTo', () => mockNavigateTo)

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser.value = { name: 'Test User', email: 'test@example.com', role: 'admin' }
    mockLoggedIn.value = true
    mockZoomState.zoomLevel.value = 1.0
  })

  it('renders', async () => {
    const html = await (await renderSuspended(Component)).html()
    expect(html).toMatchSnapshot()
  })

  it('toggles mobile menu', async () => {
    const wrapper = await mountSuspended(Component)
    const burger = wrapper.find('[aria-controls="navbar-mobile"]')

    expect(wrapper.find('#navbar-mobile').classes()).not.toContain('menu-open')

    await burger.trigger('click')
    expect(wrapper.find('#navbar-mobile').classes()).toContain('menu-open')

    await burger.trigger('click')
    expect(wrapper.find('#navbar-mobile').classes()).not.toContain('menu-open')
  })

  it('logs out', async () => {
    const wrapper = await mountSuspended(Component)
    const logoutButton = wrapper.find('#navbar-desktop button')
    await logoutButton.trigger('click')

    expect(mockClear).toHaveBeenCalled()
    expect(mockNavigateTo).toHaveBeenCalledWith('/login')
  })

  it('shows email when name is not set', async () => {
    mockUser.value = { email: 'test@example.com', role: 'admin' }
    const wrapper = await mountSuspended(Component)
    expect(wrapper.text()).toContain('test@example.com')
  })

  it('hides menus when not logged in', async () => {
    mockLoggedIn.value = false
    const wrapper = await mountSuspended(Component)
    expect(wrapper.find('#navbar-desktop').exists()).toBe(false)
    expect(wrapper.find('#navbar-mobile').exists()).toBe(false)
    expect(wrapper.find('[aria-controls="navbar-mobile"]').exists()).toBe(false)
  })

  it('hides admin link for non-admin users', async () => {
    mockUser.value = { name: 'Regular User', email: 'user@example.com', role: 'user' }
    const wrapper = await mountSuspended(Component)
    expect(wrapper.find('#navbar-desktop a[href="/admin/members/add"]').exists()).toBe(false)
    // Open mobile menu and check there too
    await wrapper.find('[aria-controls="navbar-mobile"]').trigger('click')
    expect(wrapper.find('#navbar-mobile a[href="/admin/members/add"]').exists()).toBe(false)
  })

  it('logs out from mobile menu', async () => {
    const wrapper = await mountSuspended(Component)
    // Open mobile menu
    await wrapper.find('[aria-controls="navbar-mobile"]').trigger('click')
    // Click mobile logout button
    const mobileLogout = wrapper.find('#navbar-mobile button')
    await mobileLogout.trigger('click')
    expect(mockClear).toHaveBeenCalled()
  })

  it('closes mobile menu when clicking admin link', async () => {
    const wrapper = await mountSuspended(Component)
    await wrapper.find('[aria-controls="navbar-mobile"]').trigger('click')
    expect(wrapper.find('#navbar-mobile').classes()).toContain('menu-open')
    // Click the admin NuxtLink in mobile menu
    await wrapper.find('#navbar-mobile nav a').trigger('click')
    expect(wrapper.find('#navbar-mobile').classes()).not.toContain('menu-open')
  })

  it('renders mobile menu content for non-admin user', async () => {
    mockUser.value = { name: 'Regular', email: 'user@example.com', role: 'user' }
    const wrapper = await mountSuspended(Component)
    // Open mobile menu
    await wrapper.find('[aria-controls="navbar-mobile"]').trigger('click')
    expect(wrapper.find('#navbar-mobile').classes()).toContain('menu-open')
    // Admin link should not be in mobile menu
    const mobileLinks = wrapper.findAll('#navbar-mobile nav a')
    expect(mobileLinks).toHaveLength(0)
    // Logout button should still be present
    expect(wrapper.find('#navbar-mobile nav button').exists()).toBe(true)
  })

  it('applies zoom style when chromeZoom is not 1', async () => {
    mockZoomState.zoomLevel.value = 1.5
    const wrapper = await mountSuspended(Component)
    const nav = wrapper.find('nav')
    expect(nav.attributes('style')).toContain('zoom')
  })
})
