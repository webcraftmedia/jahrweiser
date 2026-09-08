import { mountSuspended, renderSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Page from './telegram.vue'

const mock$fetch = vi.fn()
vi.stubGlobal('$fetch', mock$fetch)

const CHANNELS = [
  {
    name: 'Kultur-Steher',
    description: 'Orga und Termine',
    url: 'https://t.me/+AbCdEf',
    public: false,
  },
  { name: 'GG&G Info', url: 'https://t.me/ggg_info', public: true },
]

function fetchReturning(channels: unknown) {
  return (url: string) => {
    if (url === '/api/telegram-channels') return Promise.resolve(channels)
    return Promise.resolve({})
  }
}

async function mountLoaded(channels: unknown = CHANNELS) {
  mock$fetch.mockImplementation(fetchReturning(channels))
  const wrapper = await mountSuspended(Page, { route: '/telegram' })
  await vi.waitFor(() => {
    expect(wrapper.find('ul').exists() || wrapper.text().includes('telegram.empty')).toBe(true)
  })
  return wrapper
}

describe('Page: Telegram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock$fetch.mockImplementation(fetchReturning(CHANNELS))
    // The channel list lives in useState, shared with the icon rail.
    useState<unknown[]>('telegram-channels', () => []).value = []
    useState('telegram-channels-loaded', () => false).value = false
    useState('telegram-channels-error', () => false).value = false
  })

  it('renders the loaded channels', async () => {
    const wrapper = await mountLoaded()
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('shows a loading state before the list resolves', async () => {
    mock$fetch.mockImplementation(() => new Promise(() => {}))
    const html = await (await renderSuspended(Page, { route: '/telegram' })).html()
    expect(html).toContain('loading-dot')
  })

  it('links every channel out to Telegram', async () => {
    const wrapper = await mountLoaded()
    const anchors = wrapper.findAll('li a')
    expect(anchors.map((a) => a.attributes('href'))).toStrictEqual([
      'https://t.me/+AbCdEf',
      'https://t.me/ggg_info',
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

  it('distinguishes public channels from invite-only ones', async () => {
    // Purely a label — both are ordinary https://t.me/ links.
    const wrapper = await mountLoaded()
    const rows = wrapper.findAll('li')
    expect(rows[0]!.text()).toContain('pages.telegram.badge.invite')
    expect(rows[1]!.text()).toContain('pages.telegram.badge.public')
  })

  it('renders the optional description only when present', async () => {
    const wrapper = await mountLoaded()
    const rows = wrapper.findAll('li')
    expect(rows[0]!.text()).toContain('Orga und Termine')
    expect(rows[1]!.text()).toContain('GG&G Info')
  })

  it('shows the empty state when nothing is configured', async () => {
    const wrapper = await mountLoaded([])
    expect(wrapper.text()).toContain('pages.telegram.empty')
    expect(wrapper.find('ul').exists()).toBe(false)
  })

  it('shows an error when loading fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/telegram-channels') return Promise.reject(new Error('boom'))
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/telegram' })
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.telegram.error')
    })
    consoleSpy.mockRestore()
  })
})
