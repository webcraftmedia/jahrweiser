import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'

import AppIconRail from './AppIconRail.vue'

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
  return mountSuspended(AppIconRail, { props: { orientation } })
}

describe('Component: AppIconRail', () => {
  beforeEach(() => {
    currentPath.value = '/'
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

  it('lays out vertically as a rail and horizontally as a bottom bar', async () => {
    expect((await railAt('/', 'vertical')).find('nav').classes()).toContain('flex-col')
    expect((await railAt('/', 'horizontal')).find('nav').classes()).toContain('flex-row')
  })
})
