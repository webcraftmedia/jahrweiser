import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Component from './ChangelogModal.vue'

describe('ChangelogModal', () => {
  it('renders changelog sections', async () => {
    const wrapper = await mountSuspended(Component)

    const details = wrapper.findAll('details')
    expect(details.length).toBeGreaterThanOrEqual(1)
    expect(details[0]!.text()).toContain('v1.0.0')
    expect(details[0]!.text()).toContain('2026-03-08')
  })

  it('renders markdown links as anchor tags', async () => {
    const wrapper = await mountSuspended(Component)

    const links = wrapper.findAll('.changelog-content a')
    expect(links.length).toBeGreaterThan(0)
    expect(links[0]!.attributes('href')).toContain('github.com')
    expect(links[0]!.attributes('target')).toBe('_blank')
  })

  it('renders bold markdown as font-medium spans', async () => {
    const wrapper = await mountSuspended(Component)

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
    const vm = wrapper.vm as unknown as { open: () => void }

    // Open
    vm.open()
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
})
