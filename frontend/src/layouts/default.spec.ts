import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Layout from './default.vue'

const mockZoom = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ref, computed } = require('vue')
  const zoomLevel = ref(1.0)
  return {
    zoomLevel,
    chromeZoom: computed(() => 1),
    loginZoom: computed(() => 1),
  }
})

// Replace the auto-imported useZoom composable at the source path so the
// layout template reads our reactive `zoomLevel`. mockNuxtImport is meant
// for #imports / runtime composables; for files in src/composables we go
// straight at the module.
vi.mock('~/composables/useZoom', () => ({ useZoom: () => mockZoom }))

// The rail asks for the optional sections (Telegram, Blättchen) on mount.
// Unmocked those requests resolve to nothing here, and the composables would
// store that instead of a list.
const mock$fetch = vi.fn()
vi.stubGlobal('$fetch', mock$fetch)

// The icon rail is only rendered for signed-in users, mirroring the Header.
const mockLoggedIn = ref(false)
mockNuxtImport('useUserSession', () => () => ({
  user: ref({ uid: 'u1', role: 'user' }),
  loggedIn: mockLoggedIn,
  clear: vi.fn(),
  fetch: vi.fn(),
}))

describe('Layout: Default', () => {
  beforeEach(() => {
    mockZoom.zoomLevel.value = 1.0
    mockLoggedIn.value = false
    mock$fetch.mockImplementation((url: string) =>
      Promise.resolve(url === '/api/blaettchen' ? { issues: [], contact: null } : []),
    )
  })

  it('renders with default zoom (no inline style)', async () => {
    const html = await (await renderSuspended(Layout, { route: '/' })).html()
    expect(html).toMatchSnapshot()
    expect(html).not.toContain('zoom:')
  })

  it('applies inline zoom style when zoomLevel !== 1', async () => {
    mockZoom.zoomLevel.value = 1.3
    const html = await (await renderSuspended(Layout, { route: '/' })).html()
    // Truthy branch of `:style="zoomLevel !== 1 ? { zoom } : undefined"`.
    expect(html).toContain('zoom: 1.3')
  })

  it('hides the icon rail while signed out', async () => {
    const html = await (await renderSuspended(Layout, { route: '/' })).html()
    expect(html).not.toContain('AppIconRail')
    expect(html).not.toContain('aria-label="components.AppIconRail.label"')
  })

  it('renders the rail twice when signed in: left on desktop, bottom on mobile', async () => {
    mockLoggedIn.value = true
    const html = await (await renderSuspended(Layout, { route: '/' })).html()
    const navs = html.match(/aria-label="components\.AppIconRail\.label"/g) ?? []
    expect(navs).toHaveLength(2)
    // One instance is desktop-only, the other mobile-only — otherwise both
    // would show at once on some breakpoint.
    expect(html).toContain('hidden md:flex')
    expect(html).toContain('md:hidden')
  })
})
