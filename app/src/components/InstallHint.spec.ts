import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import InstallHint from './InstallHint.vue'

import type { InstallMethod } from '~/composables/useInstallHint'

const hint = vi.hoisted(() => ({
  method: null as unknown as { value: InstallMethod | null },
  install: vi.fn(),
  dismiss: vi.fn(),
}))

vi.mock('~/composables/useInstallHint', () => ({
  useInstallHint: () => hint,
}))

describe('InstallHint', () => {
  beforeEach(() => {
    hint.method = ref<InstallMethod | null>(null)
    hint.install.mockReset()
    hint.dismiss.mockReset()
  })

  it('renders nothing when there is nothing to suggest', async () => {
    const wrapper = await mountSuspended(InstallHint)
    expect(wrapper.find('aside').exists()).toBe(false)
  })

  it.each([
    ['share', 'components.InstallHint.share'],
    ['safari', 'components.InstallHint.safari'],
    ['menu', 'components.InstallHint.menu'],
  ] as const)('explains the %s way, without an install button', async (method, text) => {
    hint.method.value = method
    const wrapper = await mountSuspended(InstallHint)
    expect(wrapper.find('aside').attributes('aria-label')).toBe('components.InstallHint.label')
    expect(wrapper.find('p').text()).toBe(text)
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]!.attributes('aria-label')).toBe('components.InstallHint.dismiss')
  })

  it('offers the browser install dialog where there is one', async () => {
    hint.method.value = 'prompt'
    const wrapper = await mountSuspended(InstallHint)
    expect(wrapper.find('p').text()).toBe('components.InstallHint.prompt')
    const install = wrapper
      .findAll('button')
      .find((b) => b.text() === 'components.InstallHint.install')
    await install!.trigger('click')
    expect(hint.install).toHaveBeenCalledTimes(1)
  })

  it('can be dismissed', async () => {
    hint.method.value = 'share'
    const wrapper = await mountSuspended(InstallHint)
    await wrapper.find('button[aria-label="components.InstallHint.dismiss"]').trigger('click')
    expect(hint.dismiss).toHaveBeenCalledTimes(1)
  })
})
