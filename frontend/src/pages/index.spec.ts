import { renderSuspended } from '@nuxt/test-utils/runtime'
import Page from './index.vue'
import { describe, expect, it } from 'vitest'

describe('Page: Index', () => {
  it('renders', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })
})
