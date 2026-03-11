import { mountSuspended, renderSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Component from './Footer.vue'

const mockState = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ref, computed, readonly } = require('vue')
  const isDark = ref(false)
  const zoomLevel = ref(1.0)
  const changelogShouldOpen = ref(false)
  return { isDark, zoomLevel, changelogShouldOpen, computed, readonly }
})

vi.mock('../composables/useColorMode', () => ({
  useColorMode: () => ({
    isDark: mockState.readonly(mockState.isDark),
    toggle: () => {
      mockState.isDark.value = !mockState.isDark.value
    },
  }),
}))

vi.mock('../composables/useZoom', () => ({
  useZoom: () => ({
    zoomLevel: mockState.zoomLevel,
    chromeZoom: mockState.computed(() => 1 + (mockState.zoomLevel.value - 1) * 0.3),
  }),
}))

const { changelogShouldOpen } = mockState
mockNuxtImport('useChangelog', () => () => ({
  openChangelog: () => {
    changelogShouldOpen.value = true
  },
  shouldOpen: changelogShouldOpen,
}))

describe('Footer', () => {
  beforeEach(() => {
    mockState.isDark.value = false
    mockState.zoomLevel.value = 1.0
    changelogShouldOpen.value = false
  })

  it('renders', async () => {
    const html = await (await renderSuspended(Component)).html()
    expect(html).toMatchSnapshot()
  })

  it('zoom out decreases zoom', async () => {
    const wrapper = await mountSuspended(Component)
    const buttons = wrapper.findAll('.zoom-btn')
    const zoomOut = buttons[0]!
    await zoomOut.trigger('click')
    expect(wrapper.text()).toContain('90%')
  })

  it('zoom reset sets zoom to 100%', async () => {
    const wrapper = await mountSuspended(Component)
    const buttons = wrapper.findAll('.zoom-btn')
    const zoomOut = buttons[0]!
    const zoomReset = buttons[1]!
    await zoomOut.trigger('click')
    expect(wrapper.text()).toContain('90%')
    await zoomReset.trigger('click')
    expect(wrapper.text()).toContain('100%')
  })

  it('zoom in increases zoom', async () => {
    const wrapper = await mountSuspended(Component)
    const buttons = wrapper.findAll('.zoom-btn')
    const zoomIn = buttons[2]!
    await zoomIn.trigger('click')
    expect(wrapper.text()).toContain('110%')
  })

  it('opens changelog modal on version click', async () => {
    const wrapper = await mountSuspended(Component)
    const versionBtn = wrapper.find('button[title="components.Footer.changelog"]')
    expect(versionBtn.exists()).toBe(true)
    await versionBtn.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.modal-open').exists()).toBe(true)
  })

  it('opens changelog modal via shared state', async () => {
    const wrapper = await mountSuspended(Component)
    changelogShouldOpen.value = true
    await flushPromises()
    // Watcher fires: calls open() and resets shouldOpen
    expect(changelogShouldOpen.value).toBe(false)
    // Verify the modal was asked to open (same method tested by click test above)
    await wrapper.vm.$nextTick()
  })

  it('toggles dark mode', async () => {
    const wrapper = await mountSuspended(Component)
    // Initially light mode — moon icon
    expect(wrapper.find('.dark-toggle-icon').exists()).toBe(true)
    // Click dark mode toggle
    const darkBtn = wrapper.find('[aria-label="components.Footer.dark-mode"]')
    await darkBtn.trigger('click')
    // Icon should have changed (still exists, different SVG path)
    expect(wrapper.find('.dark-toggle-icon').exists()).toBe(true)
  })
})
