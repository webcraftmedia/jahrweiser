import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AppIconRail from './AppIconRail.vue'

const mock$fetch = vi.fn()
vi.stubGlobal('$fetch', mock$fetch)

const CHANNELS = [{ name: 'Info', url: 'https://t.me/info' }]

// `mountSuspended({ route })` does not reach `useRoute()` in this harness — the
// rail renders identically for every route — so drive the path directly, the
// way the other specs here mock composables.
const currentPath = ref('/')
mockNuxtImport('useRoute', () => () => ({
  get path() {
    return currentPath.value
  },
}))

async function railAt(path: string, orientation: 'vertical' | 'horizontal' = 'vertical') {
  currentPath.value = path
  const wrapper = await mountSuspended(AppIconRail, { props: { orientation } })
  // The Telegram entry appears only after the channel list has resolved.
  await vi.waitFor(() => {
    expect(mock$fetch).toHaveBeenCalled()
  })
  await nextTick()
  return wrapper
}

describe('Component: AppIconRail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentPath.value = '/'
    mock$fetch.mockResolvedValue(CHANNELS)
    // useState is shared between mounts; clear it so each test starts fresh.
    useState<unknown[]>('telegram-channels', () => []).value = []
    useState('telegram-channels-loaded', () => false).value = false
  })

  it('renders one icon-only link per section', async () => {
    const wrapper = await railAt('/')
    const anchors = wrapper.findAll('nav a')
    expect(anchors.map((a) => a.attributes('href'))).toStrictEqual(['/', '/telegram'])
    // Icon-only navigation is unusable with a screen reader unless every link
    // carries a text alternative.
    expect(anchors.every((a) => (a.attributes('aria-label') ?? '').length > 0)).toBe(true)
    expect(wrapper.text().trim()).toBe('')
  })

  it('labels the navigation itself', async () => {
    const wrapper = await railAt('/')
    expect(wrapper.find('nav').attributes('aria-label')).toBeTruthy()
  })

  it.each([
    ['/', true],
    ['/2026/09', true],
    ['/2026/09/event/abc', true],
    ['/2026/09/event/abc/3', true],
    ['/telegram', false],
    ['/settings/profile', false],
    ['/admin/links', false],
  ])('marks the calendar active on %s → %s', async (path, active) => {
    // The calendar owns `/` plus its dated permalinks; another top-level page
    // must not light it up.
    const wrapper = await railAt(path)
    expect(wrapper.findAll('nav a')[0]!.attributes('aria-current')).toBe(
      active ? 'page' : undefined,
    )
  })

  it('marks telegram active on its own page only', async () => {
    expect((await railAt('/telegram')).findAll('nav a')[1]!.attributes('aria-current')).toBe('page')
    expect((await railAt('/')).findAll('nav a')[1]!.attributes('aria-current')).toBeUndefined()
  })

  describe('telegram entry visibility', () => {
    it('is absent while no channels are configured (empty list or missing file)', async () => {
      // The endpoint answers [] for both, so one case covers both.
      mock$fetch.mockResolvedValue([])
      const wrapper = await railAt('/')
      expect(wrapper.findAll('nav a').map((a) => a.attributes('href'))).toStrictEqual(['/'])
    })

    it('is absent when the channels cannot be read at all', async () => {
      // Broken JSON, wrong permissions, endpoint down: members must not be
      // offered a link into an error page. The server logs and answers 500.
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockRejectedValue(new Error('500'))
      const wrapper = await railAt('/')
      expect(wrapper.findAll('nav a').map((a) => a.attributes('href'))).toStrictEqual(['/'])
      consoleSpy.mockRestore()
    })

    it('keeps the calendar reachable in every one of those cases', async () => {
      mock$fetch.mockResolvedValue([])
      const wrapper = await railAt('/')
      expect(wrapper.find('nav a[href="/"]').exists()).toBe(true)
    })

    it('appears as soon as at least one channel exists', async () => {
      mock$fetch.mockResolvedValue(CHANNELS)
      const wrapper = await railAt('/')
      expect(wrapper.find('nav a[href="/telegram"]').exists()).toBe(true)
    })
  })

  it('lays out vertically as a rail and horizontally as a bottom bar', async () => {
    expect((await railAt('/', 'vertical')).find('nav').classes()).toContain('flex-col')
    expect((await railAt('/', 'horizontal')).find('nav').classes()).toContain('flex-row')
  })
})
