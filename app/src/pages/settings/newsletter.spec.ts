import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { stubApi } from '../../../test/helpers/stub-api'

import Page from './newsletter.vue'

const mock$fetch = vi.fn()
stubApi(mock$fetch)

/** Serve the current state, then accept (or reject) the toggle. */
function serving(subscribed: boolean, save: 'ok' | 'fail' = 'ok') {
  mock$fetch.mockImplementation((_url: string, opts?: { method?: string }) => {
    if (opts?.method === 'POST') {
      return save === 'ok' ? Promise.resolve({}) : Promise.reject(new Error('boom'))
    }
    return Promise.resolve({ subscribed, explicit: true })
  })
}

/** Mount and wait for the state to arrive — the page renders before it does. */
async function mountLoaded() {
  const wrapper = await mountSuspended(Page, { route: '/settings/newsletter' })
  await vi.waitFor(() => {
    expect(wrapper.text()).not.toContain('pages.settings.loading')
  })
  return wrapper
}

describe('Page: Newsletter-Einstellungen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serving(true)
  })

  it('says it is loading before the state arrives', async () => {
    mock$fetch.mockImplementation(() => new Promise(() => {}))
    const wrapper = await mountSuspended(Page, { route: '/settings/newsletter' })
    expect(wrapper.text()).toContain('pages.settings.loading')
    // Nothing to toggle yet, so no button to press.
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('shows the current subscription state', async () => {
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('pages.settings.newsletter.enabled')
    expect(wrapper.text()).toContain('pages.settings.newsletter.toggleOff')
  })

  it('offers to subscribe when the user is not subscribed', async () => {
    serving(false)
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('pages.settings.newsletter.disabled')
    expect(wrapper.text()).toContain('pages.settings.newsletter.toggleOn')
  })

  it('assumes unsubscribed when the state cannot be loaded', async () => {
    // Claiming "subscribed" on a failed request would be the worse guess: it
    // invites the user to believe they are on a list they may not be on.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mock$fetch.mockRejectedValue(new Error('offline'))
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('pages.settings.newsletter.disabled')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('unsubscribes and confirms', async () => {
    const wrapper = await mountLoaded()
    await wrapper.find('button').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.settings.newsletter.saved')
    })
    expect(mock$fetch).toHaveBeenCalledWith('/api/me/newsletter', {
      method: 'POST',
      body: { subscribed: false },
    })
    // The switch flipped, so the page now offers the opposite action.
    expect(wrapper.text()).toContain('pages.settings.newsletter.toggleOn')
  })

  it('subscribes from the unsubscribed state', async () => {
    serving(false)
    const wrapper = await mountLoaded()
    await wrapper.find('button').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.settings.newsletter.saved')
    })
    expect(mock$fetch).toHaveBeenCalledWith('/api/me/newsletter', {
      method: 'POST',
      body: { subscribed: true },
    })
  })

  it('keeps the old state visible when saving fails', async () => {
    // Flipping the label on a failed write would tell the user something that
    // is not true on the server.
    serving(true, 'fail')
    const wrapper = await mountLoaded()
    await wrapper.find('button').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.settings.newsletter.error')
    })
    expect(wrapper.text()).toContain('pages.settings.newsletter.enabled')
  })

  it('blocks the button while the write is in flight', async () => {
    let release: () => void = () => {}
    mock$fetch.mockImplementation((_url: string, opts?: { method?: string }) =>
      opts?.method === 'POST'
        ? new Promise<void>((resolve) => {
            release = resolve
          })
        : Promise.resolve({ subscribed: true, explicit: true }),
    )
    const wrapper = await mountLoaded()
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('pages.settings.newsletter.saving')

    release()
    await vi.waitFor(() => {
      expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
    })
  })
})
