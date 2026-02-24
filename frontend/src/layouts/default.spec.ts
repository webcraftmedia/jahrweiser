import { renderSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Layout from './default.vue'

describe('Layout: Default', () => {
  it('renders', async () => {
    const html = await (await renderSuspended(Layout, { route: '/' })).html()
    expect(html).toMatchSnapshot()
  })
})
