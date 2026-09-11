import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Component from './ListEntryCard.vue'

const PROPS = {
  title: 'Tauschring Bergstraße',
  description: 'Schenken, Tauschen, Suchen & Verkaufen',
  href: 'https://t.me/+AbCdEf',
  action: 'Beitreten',
}

function mount(props: Record<string, unknown> = {}) {
  return mountSuspended(Component, {
    props: { ...PROPS, ...props },
    slots: { badge: '<span class="badge">nur mit Einladung</span>' },
  })
}

describe('ListEntryCard', () => {
  it('shows title, description, badge and action', async () => {
    const wrapper = await mount()
    expect(wrapper.text()).toContain('Tauschring Bergstraße')
    expect(wrapper.text()).toContain('Schenken, Tauschen')
    expect(wrapper.find('.badge').exists()).toBe(true)
    expect(wrapper.find('a').text()).toBe('Beitreten')
  })

  it('opens the target in a tab that cannot reach back', async () => {
    const link = (await mount()).find('a')
    expect(link.attributes('href')).toBe('https://t.me/+AbCdEf')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
    expect(link.attributes('rel')).toContain('noreferrer')
  })

  it('leaves out the description when there is none', async () => {
    const wrapper = await mount({ description: undefined })
    expect(wrapper.find('p').exists()).toBe(false)
  })

  it('carries a spoken label when one is given', async () => {
    // Ten links reading "Beitreten" are useless in a screen reader's link list.
    const wrapper = await mount({ ariaLabel: 'Tauschring Bergstraße beitreten' })
    expect(wrapper.find('a').attributes('aria-label')).toBe('Tauschring Bergstraße beitreten')
  })

  it('omits the attribute rather than emitting an empty one', async () => {
    expect((await mount()).find('a').attributes('aria-label')).toBeUndefined()
  })

  it('lets a free-form title wrap and moves the action below it on a phone', async () => {
    // The default: a channel name is what the reader came for and must not be
    // cut, so the card grows downwards instead.
    const wrapper = await mount()
    expect(wrapper.find('li > div').classes()).toContain('flex-col')
    expect(wrapper.find('span').classes()).toContain('break-words')
    expect(wrapper.find('span').classes()).not.toContain('truncate')
  })

  it('keeps a compact entry on one line and cuts what does not fit', async () => {
    // A Blättchen issue: title and badge are formulaic, so the row's height
    // must not depend on how long a month happens to be called.
    const wrapper = await mount({ compact: true })
    const row = wrapper.find('li > div')
    expect(row.classes()).not.toContain('flex-col')
    expect(row.classes()).toContain('items-center')
    expect(wrapper.find('span').classes()).toContain('truncate')
    expect(wrapper.find('p').classes()).toContain('truncate')
  })
})
