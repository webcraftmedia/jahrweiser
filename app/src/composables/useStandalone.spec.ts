import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isStandalone, useStandalone } from './useStandalone'

function displayMode(standalone: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: standalone && query.includes('standalone') }) as MediaQueryList,
  )
}

describe('useStandalone', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('recognises an app started from the home screen', () => {
    displayMode(true)
    expect(isStandalone()).toBe(true)
  })

  it('recognises the iOS home-screen app by its own flag', () => {
    displayMode(false)
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    expect(isStandalone()).toBe(true)
    Reflect.deleteProperty(navigator, 'standalone')
  })

  it('treats a browser tab as a browser tab', () => {
    displayMode(false)
    expect(isStandalone()).toBe(false)
  })

  it('answers only after mount, so the first render matches the server', async () => {
    displayMode(true)
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
    expect(seen).toBe(false)
    expect(wrapper.text()).toBe('true')
  })
})
