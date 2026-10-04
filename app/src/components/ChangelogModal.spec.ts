import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { stubApi } from '../../test/helpers/stub-api'

import Component from './ChangelogModal.vue'

import type { Changelog } from '~~/shared/changelog'

const PR = 'https://github.com/org/repo/issues/444'

const CHANGELOG: Changelog = {
  releases: [
    {
      version: '1.16',
      versions: ['1.16.0', '1.16.1'],
      dateFrom: '2026-10-03',
      dateTo: '2026-10-05',
      features: [{ text: 'Project section', link: { label: '#444', url: PR } }],
      fixes: [{ text: 'Hover fix' }, { text: 'Another fix' }],
    },
    {
      version: '1.15',
      versions: ['1.15.0'],
      dateFrom: '2026-09-24',
      dateTo: '2026-09-24',
      features: [],
      fixes: [],
    },
    {
      version: 'Unreleased',
      versions: ['Unreleased'],
      dateFrom: '',
      dateTo: '',
      features: [],
      fixes: [{ text: 'Only a fix' }],
    },
  ],
  older: 3,
}

const fetchMock = vi.fn()
stubApi(fetchMock)

async function mountOpen() {
  const wrapper = await mountSuspended(Component)
  await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
  await flushPromises()
  return wrapper
}

describe('ChangelogModal', () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(CHANGELOG)
  })

  it('renders one section per minor release, the newest opened', async () => {
    const wrapper = await mountOpen()
    const releases = wrapper.findAll('.changelog-release')
    expect(releases).toHaveLength(3)
    expect(releases[0]!.find('summary').text()).toContain('components.ChangelogModal.version')
    expect(releases[0]!.attributes('open')).toBeDefined()
    expect(releases[1]!.attributes('open')).toBeUndefined()
  })

  it('formats the date range of a release', async () => {
    const wrapper = await mountOpen()
    const summaries = wrapper.findAll('.changelog-release > summary')
    // Collapsed into one range in whatever locale the test runs with.
    expect(summaries[0]!.findAll('span')[1]!.text()).toMatch(/^\D*0?3\D+0?5\D.*2026$/)
  })

  it('shows no date for a release without one', async () => {
    const wrapper = await mountOpen()
    const summary = wrapper.findAll('.changelog-release > summary')[2]!
    expect(summary.findAll('span')[1]!.text()).toBe('')
  })

  it('lists features openly and links their pull request', async () => {
    const wrapper = await mountOpen()
    const features = wrapper.find('.changelog-features')
    expect(features.text()).toContain('Project section')
    const link = features.find('a')
    expect(link.attributes('href')).toBe(PR)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.text()).toBe('#444')
  })

  it('folds fixes behind a collapsed summary', async () => {
    const wrapper = await mountOpen()
    const fixes = wrapper.find('.changelog-fixes')
    expect(fixes.attributes('open')).toBeUndefined()
    expect(fixes.find('summary').text()).toContain('components.ChangelogModal.fixes')
    expect(fixes.findAll('li').map((li) => li.text())).toStrictEqual(['Hover fix', 'Another fix'])
    expect(fixes.find('a').exists()).toBe(false)
  })

  it('says so when a release has only internal changes', async () => {
    const wrapper = await mountOpen()
    const release = wrapper.findAll('.changelog-release')[1]!
    expect(release.text()).toContain('components.ChangelogModal.internal-only')
    expect(release.find('.changelog-features').exists()).toBe(false)
    expect(release.find('.changelog-fixes').exists()).toBe(false)
  })

  it('names the folded patch releases', async () => {
    const wrapper = await mountOpen()
    expect(wrapper.find('.changelog-versions').text()).toContain(
      'components.ChangelogModal.contains',
    )
  })

  it('links older releases to the changelog on GitHub', async () => {
    const wrapper = await mountOpen()
    const link = wrapper.find('.changelog-older')
    expect(link.attributes('href')).toBe(
      'https://github.com/webcraftmedia/jahrweiser/blob/master/CHANGELOG.md',
    )
    expect(link.text()).toContain('components.ChangelogModal.older')
  })

  it('shows an empty state and no older link without releases', async () => {
    fetchMock.mockResolvedValue({ releases: [], older: 0 })
    const wrapper = await mountOpen()
    expect(wrapper.text()).toContain('components.ChangelogModal.empty')
    expect(wrapper.find('.changelog-older').exists()).toBe(false)
  })

  it('has GitHub link', async () => {
    const wrapper = await mountSuspended(Component)
    const ghLink = wrapper.find('a[href="https://github.com/webcraftmedia/jahrweiser"]')
    expect(ghLink.exists()).toBe(true)
    expect(ghLink.attributes('target')).toBe('_blank')
  })

  it('opens and closes modal', async () => {
    const wrapper = await mountOpen()
    expect(wrapper.find('.modal-open').exists()).toBe(true)

    await wrapper.find('.modal-overlay').trigger('click')
    expect(wrapper.find('.modal-open').exists()).toBe(false)
  })

  it('keeps clicks inside the content from closing the modal', async () => {
    const wrapper = await mountOpen()
    await wrapper.find('a[href="https://github.com/webcraftmedia/jahrweiser"]').trigger('click')
    await wrapper.find('summary').trigger('click')
    await wrapper.find('.changelog-content').trigger('click')
    await wrapper.find('.changelog-features a').trigger('click')
    await wrapper.find('.changelog-older').trigger('click')
    expect(wrapper.find('.modal-open').exists()).toBe(true)
  })

  it('fetches only once', async () => {
    const wrapper = await mountOpen()
    await wrapper.find('.modal-overlay').trigger('click')
    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
