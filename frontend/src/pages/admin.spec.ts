import { renderSuspended } from '@nuxt/test-utils/runtime'
import Page from './admin.vue'
import { describe, expect, it } from 'vitest'

describe('Page: Admin', () => {
  it('renders', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/admin',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })
})
