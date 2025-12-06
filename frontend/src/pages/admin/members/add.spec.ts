import { renderSuspended } from '@nuxt/test-utils/runtime'
import Page from './add.vue'
import { describe, expect, it } from 'vitest'

describe('Page: Add', () => {
  it('renders', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/admin/members/add',
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
