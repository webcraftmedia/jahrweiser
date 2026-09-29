import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Page from './gemeinschaft.vue'

describe('Page: Die Gemeinschaft', () => {
  it('leads with the name and unfolds it section by section', async () => {
    const wrapper = await mountSuspended(Page, { route: '/projekt/gemeinschaft' })
    const text = wrapper.text()
    expect(text).toContain('pages.projekt.gemeinschaft.lead.heading')
    for (const section of ['gemeinsam', 'gestalten', 'geniessen', 'verbindet', 'offen']) {
      expect(text).toContain(`pages.projekt.gemeinschaft.${section}.heading`)
      expect(text).toContain(`pages.projekt.gemeinschaft.${section}.text`)
    }
  })

  it('is a text page — it asks nothing of the reader', async () => {
    // No form, no call to action: whoever lands here wants to know who we are,
    // not to do something. The asks live on the neighbouring pages.
    const wrapper = await mountSuspended(Page, { route: '/projekt/gemeinschaft' })
    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})
