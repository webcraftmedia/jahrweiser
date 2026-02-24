import { renderSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Page from './index.vue'

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
