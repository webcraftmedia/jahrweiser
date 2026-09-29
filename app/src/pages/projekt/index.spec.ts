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

  it('says that donations are still being set up', async () => {
    // Deliberately a placeholder rather than a missing section: the members ask
    // for it, and "in Kürze" is an answer where silence is not.
    const wrapper = await mountSuspended(Page, { route: '/projekt' })
    expect(wrapper.text()).toContain('pages.projekt.about.donate.text')
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
