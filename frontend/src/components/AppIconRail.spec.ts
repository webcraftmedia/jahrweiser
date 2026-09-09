import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { stubApi } from '../../test/helpers/stub-api'

import AppIconRail from './AppIconRail.vue'

const mock$fetch = vi.fn()
stubApi(mock$fetch)

const CHANNELS = [{ id: 1, name: 'Info', url: 'https://t.me/info', public: true }]
const BLAETTCHEN = {
  issues: [{ number: 12, date: '2026-05-01', file: '12_2026-05-01.pdf' }],
  contact: 'redaktion@example.com',
}

/**
 * The rail asks three endpoints on mount; each test says what any of them
 * answers, `undefined` meaning "the default".
 */
function serving(
  options: {
    channels?: unknown
    blaettchen?: unknown
    hasPostalCode?: boolean
    failing?: string[]
  } = {},
): void {
  const {
    channels = CHANNELS,
    blaettchen = BLAETTCHEN,
    hasPostalCode = true,
    failing = [],
  } = options
  mock$fetch.mockImplementation((url: string) => {
    if (failing.includes(url)) return Promise.reject(new Error('500'))
    if (url === '/api/telegram-channels') return Promise.resolve(channels)
    if (url === '/api/blaettchen') return Promise.resolve(blaettchen)
    if (url === '/api/map/status') return Promise.resolve({ hasPostalCode })
    return Promise.resolve({})
  })
}

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
  // The optional entries appear only after their lists have resolved.
  await vi.waitFor(() => {
    expect(mock$fetch).toHaveBeenCalledWith('/api/telegram-channels')
    expect(mock$fetch).toHaveBeenCalledWith('/api/blaettchen')
    expect(mock$fetch).toHaveBeenCalledWith('/api/map/status')
  })
  await nextTick()
  return wrapper
}

describe('Component: AppIconRail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentPath.value = '/'
    serving()
    // useState is shared between mounts; clear it so each test starts fresh.
    useState<unknown[]>('telegram-channels', () => []).value = []
    useState('telegram-channels-loaded', () => false).value = false
    useState<unknown[]>('blaettchen-issues', () => []).value = []
    useState('blaettchen-loaded', () => false).value = false
    useState<boolean | null>('member-map-has-plz', () => null).value = null
    useState('member-map-status-loaded', () => false).value = false
  })

  it('renders one icon-only link per section', async () => {
    const wrapper = await railAt('/')
    const anchors = wrapper.findAll('nav a')
    expect(anchors.map((a) => a.attributes('href'))).toStrictEqual([
      '/',
      '/blaettchen',
      '/telegram',
      '/karte',
    ])
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
    ['/blaettchen', false],
    ['/karte', false],
    ['/settings/profile', false],
    ['/admin/links', false],
  ])('marks the calendar active on %s → %s', async (path, active) => {
    // The calendar owns `/` plus its dated permalinks; another top-level page
    // must not light it up.
    const wrapper = await railAt(path)
    expect(wrapper.find('nav a[href="/"]').attributes('aria-current')).toBe(
      active ? 'page' : undefined,
    )
  })

  it.each(['/blaettchen', '/telegram', '/karte'])(
    'marks %s active on its own page only',
    async (section) => {
      expect(
        (await railAt(section)).find(`nav a[href="${section}"]`).attributes('aria-current'),
      ).toBe('page')
      expect(
        (await railAt('/')).find(`nav a[href="${section}"]`).attributes('aria-current'),
      ).toBeUndefined()
    },
  )

  describe('telegram entry visibility', () => {
    it('is absent while no channels are configured (empty list or missing file)', async () => {
      // The endpoint answers [] for both, so one case covers both.
      serving({ channels: [] })
      const wrapper = await railAt('/')
      expect(wrapper.find('nav a[href="/telegram"]').exists()).toBe(false)
    })

    it('is absent when the channels cannot be read at all', async () => {
      // Broken JSON, wrong permissions, endpoint down: members must not be
      // offered a link into an error page. The server logs and answers 500.
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      serving({ failing: ['/api/telegram-channels'] })
      const wrapper = await railAt('/')
      expect(wrapper.find('nav a[href="/telegram"]').exists()).toBe(false)
      // The unrelated section stays where it is.
      expect(wrapper.find('nav a[href="/blaettchen"]').exists()).toBe(true)
      consoleSpy.mockRestore()
    })

    it('appears as soon as at least one channel exists', async () => {
      const wrapper = await railAt('/')
      expect(wrapper.find('nav a[href="/telegram"]').exists()).toBe(true)
    })
  })

  describe('blaettchen entry visibility', () => {
    it('is absent while no issue has been published', async () => {
      serving({ blaettchen: { issues: [], contact: 'redaktion@example.com' } })
      const wrapper = await railAt('/')
      expect(wrapper.find('nav a[href="/blaettchen"]').exists()).toBe(false)
    })

    it('is absent when the issues cannot be read at all', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      serving({ failing: ['/api/blaettchen'] })
      const wrapper = await railAt('/')
      expect(wrapper.find('nav a[href="/blaettchen"]').exists()).toBe(false)
      expect(wrapper.find('nav a[href="/telegram"]').exists()).toBe(true)
      consoleSpy.mockRestore()
    })

    it('appears as soon as one issue exists', async () => {
      const wrapper = await railAt('/')
      expect(wrapper.find('nav a[href="/blaettchen"]').exists()).toBe(true)
    })
  })

  describe('map entry', () => {
    // Unlike Telegram and Blättchen, the map is offered to everyone — what is
    // missing is the member's own postal code, and the rail says so.
    it('is offered even when the member has no postal code', async () => {
      serving({ hasPostalCode: false })
      const wrapper = await railAt('/')
      expect(wrapper.find('nav a[href="/karte"]').exists()).toBe(true)
    })

    it('marks the entry while no postal code is on file', async () => {
      serving({ hasPostalCode: false })
      const wrapper = await railAt('/')
      await vi.waitFor(() => {
        expect(wrapper.find('nav a[href="/karte"] .rail-warn').exists()).toBe(true)
      })
      // The dot is never the only thing carrying the state: the accessible
      // name switches to the one that names what is missing.
      expect(wrapper.find('nav a[href="/karte"]').attributes('aria-label')).toBe(
        'components.AppIconRail.map-incomplete',
      )
    })

    it('drops the marker once a postal code is on file', async () => {
      const wrapper = await railAt('/')
      await vi.waitFor(() => {
        expect(mock$fetch).toHaveBeenCalledWith('/api/map/status')
      })
      expect(wrapper.find('nav a[href="/karte"] .rail-warn').exists()).toBe(false)
      expect(wrapper.find('nav a[href="/karte"]').attributes('aria-label')).toBe(
        'components.AppIconRail.map',
      )
    })

    it('shows no marker while the status could not be read', async () => {
      // Unknown is not "missing": a warning nothing can clear is worse than none.
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      serving({ failing: ['/api/map/status'] })
      const wrapper = await railAt('/')
      expect(wrapper.find('nav a[href="/karte"]').exists()).toBe(true)
      expect(wrapper.find('nav a[href="/karte"] .rail-warn').exists()).toBe(false)
      consoleSpy.mockRestore()
    })
  })

  it('keeps the calendar reachable when everything else is missing or broken', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    serving({ channels: [], failing: ['/api/blaettchen'] })
    const wrapper = await railAt('/')
    expect(wrapper.findAll('nav a').map((a) => a.attributes('href'))).toStrictEqual(['/', '/karte'])
    consoleSpy.mockRestore()
  })

  it('lays out vertically as a rail and horizontally as a bottom bar', async () => {
    expect((await railAt('/', 'vertical')).find('nav').classes()).toContain('flex-col')
    expect((await railAt('/', 'horizontal')).find('nav').classes()).toContain('flex-row')
  })
})
