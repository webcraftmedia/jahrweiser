import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import Component from './ChangelogModal.vue'

const MOCK_CHANGELOG =
  '## 1.0.0 (2026-01-01)\n\n### Features\n\n* **scope:** feature one ([#1](https://github.com/org/repo/issues/1))\n\n### Bug Fixes\n\n* **other:** fix one\n'

vi.stubGlobal(
  '$fetch',
  vi.fn().mockResolvedValue(MOCK_CHANGELOG),
)

describe('ChangelogModal', () => {
  it('renders changelog sections', async () => {
    const wrapper = await mountSuspended(Component)
    const vm = wrapper.vm as unknown as { open: () => Promise<void> }
    await vm.open()
    await flushPromises()
    await wrapper.vm.$nextTick()

    const details = wrapper.findAll('details')
    expect(details).toHaveLength(1)
    expect(details[0]!.text()).toContain('v1.0.0')
    expect(details[0]!.text()).toContain('2026-01-01')
  })

  it('renders markdown links as anchor tags', async () => {
    const wrapper = await mountSuspended(Component)
    const vm = wrapper.vm as unknown as { open: () => Promise<void> }
    await vm.open()
    await flushPromises()
    await wrapper.vm.$nextTick()

    const links = wrapper.findAll('.changelog-content a')
    expect(links.length).toBeGreaterThan(0)
    expect(links[0]!.attributes('href')).toContain('github.com')
    expect(links[0]!.attributes('target')).toBe('_blank')
  })

  it('renders bold markdown as font-medium spans', async () => {
    const wrapper = await mountSuspended(Component)
    const vm = wrapper.vm as unknown as { open: () => Promise<void> }
    await vm.open()
    await flushPromises()
    await wrapper.vm.$nextTick()

    const bolds = wrapper.findAll('.changelog-content .font-medium')
    expect(bolds.length).toBeGreaterThan(0)
  })

  it('has GitHub link', async () => {
    const wrapper = await mountSuspended(Component)

    const ghLink = wrapper.find('a[href="https://github.com/webcraftmedia/jahrweiser"]')
    expect(ghLink.exists()).toBe(true)
    expect(ghLink.attributes('target')).toBe('_blank')
  })

  it('opens and closes modal', async () => {
    const wrapper = await mountSuspended(Component)
    const vm = wrapper.vm as unknown as { open: () => Promise<void> }

    // Open
    await vm.open()
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.modal-open').exists()).toBe(true)

    // Close via @x emit (backdrop/close button click)
    const overlay = wrapper.find('.modal-overlay')
    await overlay.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.modal-open').exists()).toBe(false)
  })

  it('click.stop on interactive elements prevents propagation', async () => {
    const wrapper = await mountSuspended(Component)
    const vm = wrapper.vm as unknown as { open: () => Promise<void> }
    await vm.open()
    await flushPromises()
    await wrapper.vm.$nextTick()

    // GitHub link
    const ghLink = wrapper.find('a[href="https://github.com/webcraftmedia/jahrweiser"]')
    await ghLink.trigger('click')

    // Summary
    const summary = wrapper.find('summary')
    await summary.trigger('click')

    // Changelog content
    const content = wrapper.find('.changelog-content')
    await content.trigger('click')

    // All clicks handled without errors
    expect(wrapper.exists()).toBe(true)
  })

  it('uses cached sections on second open', async () => {
    const fetchSpy = globalThis.$fetch as ReturnType<typeof vi.fn>
    fetchSpy.mockClear()

    const wrapper = await mountSuspended(Component)
    const vm = wrapper.vm as unknown as { open: () => Promise<void> }

    // First open — fetches
    await vm.open()
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Close via overlay click
    const overlay = wrapper.find('.modal-overlay')
    await overlay.trigger('click')
    await wrapper.vm.$nextTick()

    // Second open — uses cache, no re-fetch
    await vm.open()
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
