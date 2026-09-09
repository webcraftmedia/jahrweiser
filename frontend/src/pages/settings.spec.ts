import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Page from './settings.vue'

describe('Page: Einstellungen (Rahmen)', () => {
  it('offers both settings sections in the sidebar', async () => {
    const wrapper = await mountSuspended(Page, { route: '/settings/profile' })
    const links = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(links).toContain('/settings/profile')
    expect(links).toContain('/settings/newsletter')
  })

  it('titles the frame', async () => {
    const wrapper = await mountSuspended(Page, { route: '/settings/profile' })
    expect(wrapper.text()).toContain('pages.settings.title')
  })
})
