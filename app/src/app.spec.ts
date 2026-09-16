import { renderSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import App from './app.vue'

describe('App', () => {
  it('renders default page', async () => {
    const html = await (await renderSuspended(App, { route: '/' })).html()
    expect(html).toMatchSnapshot()
  })
})
