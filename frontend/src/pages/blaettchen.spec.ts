import { mountSuspended, renderSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { stubApi } from '../../test/helpers/stub-api'

import Page from './blaettchen.vue'

const mock$fetch = vi.fn()
stubApi(mock$fetch)

const LISTING = {
  issues: [
    { number: 12, date: '2026-05-01', file: '12_2026-05-01.pdf' },
    {
      number: 4,
      date: '2023-12-23',
      title: 'Sonderausgabe Weihnachten',
      file: '04_2023-12-23_Sonderausgabe Weihnachten.pdf',
    },
  ],
  contact: 'redaktion@example.com',
}

function fetchReturning(listing: unknown) {
  return (url: string) => {
    if (url === '/api/blaettchen') return Promise.resolve(listing)
    return Promise.resolve({})
  }
}

async function mountLoaded(listing: unknown = LISTING) {
  mock$fetch.mockImplementation(fetchReturning(listing))
  const wrapper = await mountSuspended(Page, { route: '/blaettchen' })
  await vi.waitFor(() => {
    expect(wrapper.find('ul').exists() || wrapper.text().includes('blaettchen.empty')).toBe(true)
  })
  return wrapper
}

describe('Page: Blaettchen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock$fetch.mockImplementation(fetchReturning(LISTING))
    // The listing lives in useState, shared with the icon rail.
    useState<unknown[]>('blaettchen-issues', () => []).value = []
    useState<string | null>('blaettchen-contact', () => null).value = null
    useState('blaettchen-loaded', () => false).value = false
    useState('blaettchen-error', () => false).value = false
  })

  it('renders the loaded issues', async () => {
    const wrapper = await mountLoaded()
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('shows a loading state before the listing resolves', async () => {
    mock$fetch.mockImplementation(() => new Promise(() => {}))
    const html = await (await renderSuspended(Page, { route: '/blaettchen' })).html()
    expect(html).toContain('loading-dot')
  })

  it('links every issue to its download, file name escaped', async () => {
    const wrapper = await mountLoaded()
    const anchors = wrapper.findAll('li a')
    expect(anchors.map((a) => a.attributes('href'))).toStrictEqual([
      '/api/blaettchen/12_2026-05-01.pdf',
      '/api/blaettchen/04_2023-12-23_Sonderausgabe%20Weihnachten.pdf',
    ])
    // A new tab must not be able to reach back into this page.
    expect(
      anchors.every(
        (a) =>
          a.attributes('target') === '_blank' &&
          (a.attributes('rel') ?? '').includes('noopener') &&
          (a.attributes('rel') ?? '').includes('noreferrer'),
      ),
    ).toBe(true)
  })

  it('gives every "open" link a label beyond the bare "Öffnen"', async () => {
    // Ten identical "Öffnen" buttons are useless in a screen reader's link
    // list. That the labels really differ needs the actual translations, so it
    // is asserted in e2e-full-stack/navigation.spec.ts; here we only prove that
    // every link carries one.
    const wrapper = await mountLoaded()
    const labels = wrapper.findAll('li a').map((a) => a.attributes('aria-label'))
    expect(labels).toHaveLength(2)
    expect(labels.every((label) => (label ?? '').length > 0)).toBe(true)
  })

  it('renders the date machine-readably, in the order the server sent', async () => {
    // Newest first — the sort happens server-side, the page must not reorder.
    const wrapper = await mountLoaded()
    expect(wrapper.findAll('time').map((t) => t.attributes('datetime'))).toStrictEqual([
      '2026-05-01',
      '2023-12-23',
    ])
  })

  it('keeps an issue on one line whatever its month is called', async () => {
    // The bug this replaces: `flex-wrap` dropped the button onto its own line
    // as soon as the date got long, so "Mai" rows and "Dezember" rows looked
    // different. The row must not wrap, and the date must not break either.
    const wrapper = await mountLoaded()
    const row = wrapper.findAll('li')[1]!
    expect(row.find('div').classes()).not.toContain('flex-col')
    expect(row.find('div').classes()).toContain('items-center')
    const chip = row.find('time').element.parentElement
    expect(chip?.className).toContain('whitespace-nowrap')
    expect(chip?.className).toContain('shrink-0')
  })

  it('shortens the month in the row, keeping the day and the year', async () => {
    const wrapper = await mountLoaded()
    // The December issue is the telling one — May is short in every locale.
    const text = wrapper.findAll('time')[1]!.text()
    expect(text).toContain('23')
    expect(text).toContain('2023')
    expect(text).not.toContain('December')
  })

  it('renders the optional title only when present', async () => {
    const wrapper = await mountLoaded()
    const rows = wrapper.findAll('li')
    expect(rows[0]!.text()).not.toContain('Sonderausgabe')
    expect(rows[1]!.text()).toContain('Sonderausgabe Weihnachten')
  })

  it('asks for contributions with a prefilled mail to the configured address', async () => {
    const wrapper = await mountLoaded()
    const mailto = wrapper.find('a[href^="mailto:"]')
    expect(mailto.attributes('href')).toBe(
      'mailto:redaktion@example.com?subject=Beitrag%20f%C3%BCrs%20Bl%C3%A4ttchen',
    )
  })

  it('skips the call for contributions when no address is configured', async () => {
    // Better no invitation than a mailto: that goes nowhere.
    const wrapper = await mountLoaded({ issues: LISTING.issues, contact: null })
    expect(wrapper.find('a[href^="mailto:"]').exists()).toBe(false)
  })

  it('still asks for contributions while the archive is empty', async () => {
    // The very first issue has to be asked for, too.
    const wrapper = await mountLoaded({ issues: [], contact: 'redaktion@example.com' })
    expect(wrapper.text()).toContain('pages.blaettchen.empty')
    expect(wrapper.find('ul').exists()).toBe(false)
    expect(wrapper.find('a[href^="mailto:"]').exists()).toBe(true)
  })

  it('shows an error when loading fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/blaettchen') return Promise.reject(new Error('boom'))
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/blaettchen' })
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.blaettchen.error')
    })
    consoleSpy.mockRestore()
  })
})
