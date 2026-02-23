import { renderSuspended } from '@nuxt/test-utils/runtime'
import Page from './index.vue'
import { describe, expect, it } from 'vitest'

describe('Page: Admin Index', () => {
  it('renders', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/admin',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })
})
