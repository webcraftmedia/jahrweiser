import { mockNuxtImport, mountSuspended, renderSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Page from './admin.vue'

// Patch useRoute so isActive() / currentPageTitle can be exercised for both
// branches. Includes the minimum fields Nuxt's <NuxtPage> diffing needs.
const mockRoutePath = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ref } = require('vue')
  return ref('/admin')
})

mockNuxtImport('useRoute', () => () => ({
  get path() {
    return mockRoutePath.value
  },
  params: {},
  query: {},
  matched: [],
  meta: {},
  name: 'admin',
  fullPath: mockRoutePath.value,
  hash: '',
  redirectedFrom: undefined,
}))

describe('Page: Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRoutePath.value = '/admin'
  })

  it('renders', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/admin',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })

  it('renders sidebar with menu items', async () => {
    const wrapper = await mountSuspended(Page, {
      route: '/admin/members/add',
    })
    // isActive is called in template via :class binding for each menu item
    const aside = wrapper.find('aside')
    expect(aside.text()).toContain('pages.admin.menu.members-add')
    expect(aside.text()).toContain('pages.admin.menu.calendar')
  })

  it('shows active state classes when route matches a menu item', async () => {
    // Hits the truthy branch of `isActive(item.path) ? '...' : '...'` in both
    // desktop (line 57) and mobile (line 121) sidebars, and the truthy branch
    // of `current ? current.label : ''` (line 27).
    mockRoutePath.value = '/admin/members/add'
    const wrapper = await mountSuspended(Page)
    await wrapper.find('main button').trigger('click')
    const html = wrapper.html()
    expect(html).toContain('bg-sienna/10 text-sienna')
    const drawer = wrapper.find('.fixed.inset-y-0')
    expect(drawer.text()).toContain('pages.admin.menu.members-add')
  })

  it('shows no active state classes when route does not match any menu item', async () => {
    // Falsy branch of isActive() for every NuxtLink (lines 57 + 121) and
    // falsy branch of `currentPageTitle` (line 27 → returns '').
    mockRoutePath.value = '/admin'
    const wrapper = await mountSuspended(Page)
    const nav = wrapper.find('aside nav')
    expect(nav.html()).not.toContain('bg-sienna/10 text-sienna')
  })

  it('toggles mobile menu', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin' })
    const drawer = wrapper.find('.fixed.inset-y-0')
    // Mobile menu should be off-screen initially
    expect(drawer.classes()).toContain('-translate-x-full')

    // Click the mobile menu button (inside main content area)
    await wrapper.find('main button').trigger('click')

    // Mobile menu drawer should now be visible
    expect(drawer.classes()).toContain('translate-x-0')
    expect(drawer.classes()).not.toContain('-translate-x-full')
  })

  it('closes mobile menu via close button', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin' })
    const drawer = wrapper.find('.fixed.inset-y-0')
    // Open mobile menu
    await wrapper.find('main button').trigger('click')
    expect(drawer.classes()).toContain('translate-x-0')

    // Click the close button (X) inside the drawer
    const closeButton = drawer.find('button')
    await closeButton.trigger('click')
    expect(drawer.classes()).toContain('-translate-x-full')
  })

  it('closes mobile menu via backdrop click', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin' })
    const drawer = wrapper.find('.fixed.inset-y-0')
    await wrapper.find('main button').trigger('click')
    expect(drawer.classes()).toContain('translate-x-0')
    // Click the backdrop
    const backdrop = wrapper.find('.fixed.inset-0')
    await backdrop.trigger('click')
    expect(drawer.classes()).toContain('-translate-x-full')
  })

  it('closes mobile menu when clicking NuxtLink', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin' })
    const drawer = wrapper.find('.fixed.inset-y-0')
    await wrapper.find('main button').trigger('click')
    expect(drawer.classes()).toContain('translate-x-0')
    // Click the NuxtLink (first non-external item) inside the mobile drawer nav
    const mobileNav = drawer.find('nav')
    const links = mobileNav.findAll('a')
    // First link is NuxtLink (/admin/members/add), second is external (/admin/cal/)
    await links[0]!.trigger('click')
    expect(drawer.classes()).toContain('-translate-x-full')
  })

  it('closes mobile menu when clicking external link', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin' })
    const drawer = wrapper.find('.fixed.inset-y-0')
    await wrapper.find('main button').trigger('click')
    expect(drawer.classes()).toContain('translate-x-0')
    const mobileNav = drawer.find('nav')
    // Select the external link by href so the assertion doesn't depend on the
    // position of other (NuxtLink) menu items.
    const externalLink = mobileNav.findAll('a').find((a) => a.attributes('href') === '/admin/cal/')
    await externalLink!.trigger('click')
    expect(drawer.classes()).toContain('-translate-x-full')
  })
})
