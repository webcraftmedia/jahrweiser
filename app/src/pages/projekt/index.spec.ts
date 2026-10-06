import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  appInstalled,
  installHintEligible,
  installRequested,
  installUnsupported,
} from '../../utils/installPrompt'

import Page from './index.vue'

const standalone = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ref } = require('vue')
  return ref(false)
})
mockNuxtImport('useStandalone', () => () => standalone)

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

  describe('the app', () => {
    afterEach(() => {
      standalone.value = false
      installHintEligible.value = false
      installRequested.value = false
      installUnsupported.value = false
      appInstalled.value = false
    })

    it('says where it works in a browser that could only make a shortcut', async () => {
      installUnsupported.value = true
      const wrapper = await mountSuspended(Page, { route: '/projekt' })
      expect(wrapper.text()).toContain('pages.projekt.about.app.unsupported')
      expect(wrapper.find('[data-action="install"]').exists()).toBe(false)
    })

    it('knows the app in a browser tab once it was started from the home screen', async () => {
      appInstalled.value = true
      installHintEligible.value = true
      const wrapper = await mountSuspended(Page, { route: '/projekt' })
      expect(wrapper.text()).toContain('pages.projekt.about.app.installed')
      expect(wrapper.find('[data-action="install"]').exists()).toBe(false)
    })

    it('offers the installation in a phone or tablet browser', async () => {
      installHintEligible.value = true
      const wrapper = await mountSuspended(Page, { route: '/projekt' })
      expect(wrapper.text()).toContain('pages.projekt.about.app.text')
      await wrapper.find('[data-action="install"]').trigger('click')
      // No install event in the test browser: the hint with the steps.
      await vi.waitFor(() => {
        expect(installRequested.value).toBe(true)
      })
    })

    it('says so in the installed app, and offers nothing', async () => {
      standalone.value = true
      installHintEligible.value = true
      const wrapper = await mountSuspended(Page, { route: '/projekt' })
      expect(wrapper.text()).toContain('pages.projekt.about.app.installed')
      expect(wrapper.find('[data-action="install"]').exists()).toBe(false)
    })

    it('points a desktop browser to the phone', async () => {
      const wrapper = await mountSuspended(Page, { route: '/projekt' })
      expect(wrapper.text()).toContain('pages.projekt.about.app.desktop')
      expect(wrapper.find('[data-action="install"]').exists()).toBe(false)
    })
  })
})
