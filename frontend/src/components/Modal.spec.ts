import { mountSuspended, renderSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import Component from './Modal.vue'

describe('Modal', () => {
  it('renders', async () => {
    const html = await (await renderSuspended(Component)).html()
    expect(html).toMatchSnapshot()
  })

  it('opens and closes', async () => {
    const wrapper = await mountSuspended(Component)
    const vm = wrapper.vm as unknown as { open: () => void; close: () => void }

    expect(wrapper.find('#default-modal').classes()).toContain('modal-hidden')

    vm.open()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#default-modal').classes()).toContain('modal-open')

    vm.close()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#default-modal').classes()).toContain('modal-hidden')
  })

  it('emits x on close button click', async () => {
    const wrapper = await mountSuspended(Component)
    const vm = wrapper.vm as unknown as { open: () => void }

    vm.open()
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-modal-hide="default-modal"]').trigger('click')
    expect(wrapper.emitted('x')).toBeTruthy()
  })

  it('emits x on Escape key', async () => {
    const wrapper = await mountSuspended(Component)
    const vm = wrapper.vm as unknown as { open: () => void }

    vm.open()
    await wrapper.vm.$nextTick()

    await wrapper.find('#default-modal').trigger('keydown.esc')
    expect(wrapper.emitted('x')).toBeTruthy()
  })

  it('wraps focus from last to first on Tab', async () => {
    const wrapper = await mountSuspended(Component, {
      attachTo: document.body,
      slots: {
        content: '<button id="btn-a">A</button><button id="btn-b">B</button>',
      },
    })
    const vm = wrapper.vm as unknown as { open: () => void }
    vm.open()
    await wrapper.vm.$nextTick()

    // Focus the last slot button
    const btnB = wrapper.find('#btn-b')
    ;(btnB.element as HTMLElement).focus()
    expect(document.activeElement).toBe(btnB.element)

    // The close button is the first focusable element
    const closeBtn = wrapper.find('[data-modal-hide="default-modal"]')
    const focusSpy = vi.spyOn(closeBtn.element as HTMLElement, 'focus')

    await wrapper.find('#default-modal').trigger('keydown', { key: 'Tab', shiftKey: false })
    expect(focusSpy).toHaveBeenCalled()
  })

  it('wraps focus from first to last on Shift+Tab', async () => {
    const wrapper = await mountSuspended(Component, {
      attachTo: document.body,
      slots: {
        content: '<button id="btn-a">A</button><button id="btn-b">B</button>',
      },
    })
    const vm = wrapper.vm as unknown as { open: () => void }
    vm.open()
    await wrapper.vm.$nextTick()

    // Focus the close button (first focusable)
    const closeBtn = wrapper.find('[data-modal-hide="default-modal"]')
    ;(closeBtn.element as HTMLElement).focus()
    expect(document.activeElement).toBe(closeBtn.element)

    // Last focusable is btn-b
    const btnB = wrapper.find('#btn-b')
    const focusSpy = vi.spyOn(btnB.element as HTMLElement, 'focus')

    await wrapper.find('#default-modal').trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(focusSpy).toHaveBeenCalled()
  })

  it('ignores non-Tab keydown', async () => {
    const wrapper = await mountSuspended(Component)
    const vm = wrapper.vm as unknown as { open: () => void }
    vm.open()
    await wrapper.vm.$nextTick()

    // Should not throw or change focus
    await wrapper.find('#default-modal').trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('#default-modal').classes()).toContain('modal-open')
  })

  it('restores focus on close', async () => {
    const wrapper = await mountSuspended(Component, {
      attachTo: document.body,
    })
    // Create an external button to be the previously focused element
    const externalBtn = document.createElement('button')
    document.body.appendChild(externalBtn)
    externalBtn.focus()
    expect(document.activeElement).toBe(externalBtn)

    const vm = wrapper.vm as unknown as { open: () => void; close: () => void }
    vm.open()
    await wrapper.vm.$nextTick()

    vm.close()
    await wrapper.vm.$nextTick()
    expect(document.activeElement).toBe(externalBtn)

    document.body.removeChild(externalBtn)
  })
})
