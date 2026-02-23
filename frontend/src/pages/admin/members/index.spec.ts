import { renderSuspended } from '@nuxt/test-utils/runtime'
import Page from './index.vue'
import { describe, expect, it } from 'vitest'

describe('Page: Admin Members Index', () => {
  it('renders', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/admin/members',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })
})
