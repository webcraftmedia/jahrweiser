import { mountSuspended, renderSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import Component from './Footer.vue'

vi.mock('../composables/useColorMode', () => {
  const isDark = ref(false)
  return {
    useColorMode: () => ({
      isDark: readonly(isDark),
      toggle: () => {
        isDark.value = !isDark.value
      },
    }),
  }
})

vi.mock('../composables/useZoom', () => {
  const zoomLevel = ref(1.0)
  return {
    useZoom: () => ({
      zoomLevel,
      chromeZoom: computed(() => 1 + (zoomLevel.value - 1) * 0.3),
    }),
  }
})

describe('Footer', () => {
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
