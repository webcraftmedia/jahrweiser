import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Page from './projekt.vue'

describe('Page: Das Projekt (Rahmen)', () => {
  it('offers both project sections in the sidebar', async () => {
    const wrapper = await mountSuspended(Page, { route: '/projekt' })
    const links = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(links).toContain('/projekt')
    expect(links).toContain('/projekt/feedback')
  })

  it('titles the frame', async () => {
    const wrapper = await mountSuspended(Page, { route: '/projekt' })
    expect(wrapper.text()).toContain('pages.projekt.title')
  })
})
