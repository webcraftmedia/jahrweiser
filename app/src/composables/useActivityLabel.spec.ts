import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { useActivityLabel } from './useActivityLabel'

import { ACTIVITY_BUCKETS } from '~~/shared/activity'

describe('useActivityLabel', () => {
  it('has a label for every span', async () => {
    const wrapper = await mountSuspended(
      defineComponent({
        setup() {
          const label = useActivityLabel()
          return () => h('p', ACTIVITY_BUCKETS.map(label).join('|'))
        },
      }),
    )
    expect(wrapper.text().split('|')).toStrictEqual(
      ACTIVITY_BUCKETS.map((bucket) => `pages.admin.activity.${bucket}`),
    )
  })
})
