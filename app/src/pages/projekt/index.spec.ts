import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Page from './index.vue'

describe('Page: Über das Projekt', () => {
  it('names what the project is and what it offers', async () => {
    const wrapper = await mountSuspended(Page, { route: '/projekt' })
    const text = wrapper.text()
    expect(text).toContain('pages.projekt.about.what.heading')
    for (const feature of ['calendar', 'blaettchen', 'telegram', 'map', 'caldav']) {
      expect(text).toContain(`pages.projekt.about.what.feature.${feature}`)
    }
  })

  it('leads to the feedback form', async () => {
    const wrapper = await mountSuspended(Page, { route: '/projekt' })
    expect(wrapper.findAll('a').map((a) => a.attributes('href'))).toContain('/projekt/feedback')
  })

  it('promises nothing about donations while there is nothing to point at', async () => {
    // The placeholder is gone on purpose — it comes back with `/projekt/spenden`.
    // Asserted, not just deleted: a card that quietly reappears would ship a
    // dated promise to every member.
    const wrapper = await mountSuspended(Page, { route: '/projekt' })
    expect(wrapper.text()).not.toContain('pages.projekt.about.donate')
  })

  it('shows the running version and the legal links', async () => {
    const wrapper = await mountSuspended(Page, { route: '/projekt' })
    // The version the app was built with — '0.0.0-test' under vitest.
    expect(wrapper.text()).toContain('v0.0.0-test')
    const links = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(links).toContain('https://www.webcraft-media.de/#!impressum')
    expect(links).toContain('https://www.webcraft-media.de/#!datenschutz')
  })
})
