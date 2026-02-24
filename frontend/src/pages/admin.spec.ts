import { renderSuspended, mountSuspended } from '@nuxt/test-utils/runtime'
import Page from './admin.vue'
import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('Page: Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('toggles mobile menu', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin' })
    // Mobile menu should not be visible initially
    expect(wrapper.find('.fixed.inset-y-0').exists()).toBe(false)

    // Click the mobile menu button
    const menuButton = wrapper.find('button')
    await menuButton.trigger('click')

    // Mobile menu drawer should now be visible
    expect(wrapper.find('.fixed.inset-y-0').exists()).toBe(true)
  })

  it('closes mobile menu via close button', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin' })
    // Open mobile menu
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('.fixed.inset-y-0').exists()).toBe(true)

    // Click the close button (X) inside the drawer
    const closeButton = wrapper.find('.fixed.inset-y-0 button')
    await closeButton.trigger('click')
    expect(wrapper.find('.fixed.inset-y-0').exists()).toBe(false)
  })

  it('closes mobile menu via backdrop click', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin' })
    await wrapper.find('button').trigger('click')
    // Click the backdrop
    const backdrop = wrapper.find('.fixed.inset-0')
    await backdrop.trigger('click')
    expect(wrapper.find('.fixed.inset-y-0').exists()).toBe(false)
  })

  it('closes mobile menu when clicking NuxtLink', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin' })
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('.fixed.inset-y-0').exists()).toBe(true)
    // Click the NuxtLink (first non-external item) inside the mobile drawer nav
    const mobileNav = wrapper.find('.fixed.inset-y-0 nav')
    const links = mobileNav.findAll('a')
    // First link is NuxtLink (/admin/members/add), second is external (/admin/cal/)
    await links[0]!.trigger('click')
    expect(wrapper.find('.fixed.inset-y-0').exists()).toBe(false)
  })

  it('closes mobile menu when clicking external link', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin' })
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('.fixed.inset-y-0').exists()).toBe(true)
    const mobileNav = wrapper.find('.fixed.inset-y-0 nav')
    const links = mobileNav.findAll('a')
    // Second link is external (/admin/cal/)
    await links[1]!.trigger('click')
    expect(wrapper.find('.fixed.inset-y-0').exists()).toBe(false)
  })
})
