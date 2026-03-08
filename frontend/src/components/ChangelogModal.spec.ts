import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import Component from './ChangelogModal.vue'

describe('ChangelogModal', () => {
  // Uses the real CHANGELOG.md from runtimeConfig (injected at build time)

  it('renders changelog sections', async () => {
    const wrapper = await mountSuspended(Component)

    const details = wrapper.findAll('details')
    expect(details.length).toBeGreaterThanOrEqual(1)

    // First section should have version and date
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

  it('closes list before heading when no empty line separates them', async () => {
    // Changelog where list items directly precede a ### heading (no blank line)
    const edgeChangelog = [
      '## 1.0.0 (2026-01-01)',
      '',
      '### Features',
      '',
      '* **scope:** feature one',
      '* **scope:** feature two',
      '### Bug Fixes',
      '',
      '* **scope:** fix one',
    ].join('\n')

    vi.stubGlobal('useRuntimeConfig', () => ({
      public: { changelog: edgeChangelog, appVersion: '1.0.0' },
    }))

    const wrapper = await mountSuspended(Component)

    const content = wrapper.find('.changelog-content')
    const html = content.element.innerHTML
    // Verify the list is closed before "Bug Fixes" heading
    const bugFixesIdx = html.indexOf('Bug Fixes')
    const ulCloseIdx = html.lastIndexOf('</ul>', bugFixesIdx)
    expect(ulCloseIdx).toBeGreaterThan(-1)
    expect(ulCloseIdx).toBeLessThan(bugFixesIdx)

    vi.unstubAllGlobals()
  })

  it('has GitHub link', async () => {
    const wrapper = await mountSuspended(Component)

    const ghLink = wrapper.find('a[href="https://github.com/webcraftmedia/jahrweiser"]')
    expect(ghLink.exists()).toBe(true)
    expect(ghLink.attributes('target')).toBe('_blank')
  })

  it('exposes open method', async () => {
    const wrapper = await mountSuspended(Component)

    expect(typeof (wrapper.vm as unknown as { open: () => void }).open).toBe('function')
    ;(wrapper.vm as unknown as { open: () => void }).open()

    await wrapper.vm.$nextTick()
    expect(wrapper.find('.modal-open').exists()).toBe(true)
  })
})
