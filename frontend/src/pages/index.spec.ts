import { renderSuspended } from '@nuxt/test-utils/runtime'
import Page from './index.vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('Page: Index', () => {
  beforeEach(() => {
    // Mock Date to ensure consistent snapshots
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'))
  })

  it('renders', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })
})
