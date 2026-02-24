import { mountSuspended, renderSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Component from './Modal.vue'

describe('Modal', () => {
  it('renders', async () => {
    const html = await (await renderSuspended(Component)).html()
    expect(html).toMatchSnapshot()
  })

  it('opens and closes', async () => {
    const wrapper = await mountSuspended(Component)
    const vm = wrapper.vm as unknown as { open: () => void; close: () => void }

    expect(wrapper.find('#default-modal').classes()).toContain('hidden')

    vm.open()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#default-modal').classes()).toContain('open')

    vm.close()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#default-modal').classes()).toContain('hidden')
  })

  it('emits x on close button click', async () => {
    const wrapper = await mountSuspended(Component)
    const vm = wrapper.vm as unknown as { open: () => void }

    vm.open()
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-modal-hide="default-modal"]').trigger('click')
    expect(wrapper.emitted('x')).toBeTruthy()
  })
})
