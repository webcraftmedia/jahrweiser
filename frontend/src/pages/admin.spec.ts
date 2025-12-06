import { renderSuspended } from '@nuxt/test-utils/runtime'
import Page from './admin.vue'
import { describe, expect, it } from 'vitest'

describe('Page: Admin', () => {
  it('renders', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/admin',
        /* global: {
          stubs: {
            CalendarViewHeader: {
              template: '<span />',
            },
            CalendarView: {
              template: '<span />',
            },
          },
        },*/
      })
    ).html()
    expect(html).toMatchSnapshot()
  })
})
