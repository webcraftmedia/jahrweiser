import { renderSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import Layout from './default.vue'

describe('Layout: Default', () => {
  beforeEach(() => {
    mockZoom.zoomLevel.value = 1.0
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
})
