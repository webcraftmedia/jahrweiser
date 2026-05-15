import { renderSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockZoom = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ref } = require('vue')
  const loginZoom = ref(1.0)
  return { zoomLevel: ref(1), chromeZoom: ref(1), loginZoom }
})

vi.mock('~/composables/useZoom', () => ({ useZoom: () => mockZoom }))

import Layout from './login.vue'

describe('Layout: Login', () => {
  beforeEach(() => {
    mockZoom.loginZoom.value = 1.0
  })

  it('renders with default zoom (no inline style)', async () => {
    const html = await (await renderSuspended(Layout, { route: '/login' })).html()
    expect(html).toMatchSnapshot()
    expect(html).not.toContain('zoom:')
  })

  it('applies inline zoom style when loginZoom !== 1', async () => {
    mockZoom.loginZoom.value = 1.25
    const html = await (await renderSuspended(Layout, { route: '/login' })).html()
    // Truthy branch of `:style="loginZoom !== 1 ? { zoom } : undefined"`.
    expect(html).toContain('zoom: 1.25')
  })
})
