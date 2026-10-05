import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useStandalone } from './useStandalone'

// The rule itself is tested with the other device heuristics (utils/device.spec.ts).

function displayMode(standalone: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: standalone && query.includes('standalone') }) as MediaQueryList,
  )
}

async function mountProbe() {
  let seen: boolean | undefined
  const wrapper = await mountSuspended(
    defineComponent({
      setup() {
        const standalone = useStandalone()
        seen = standalone.value
        return () => h('div', String(standalone.value))
      },
    }),
  )
  return { wrapper, seen }
}

describe('useStandalone', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('answers only after mount, so the first render matches the server', async () => {
    displayMode(true)
    const { wrapper, seen } = await mountProbe()
    expect(seen).toBe(false)
    expect(wrapper.text()).toBe('true')
  })

  it('stays false in a browser tab', async () => {
    displayMode(false)
    const { wrapper } = await mountProbe()
    expect(wrapper.text()).toBe('false')
  })
})
