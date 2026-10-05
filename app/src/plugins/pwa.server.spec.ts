import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UA } from '../../test/helpers/device-env'
import { pwaHeadLinks } from '../utils/pwaHead'

import plugin from './pwa.server'

const mocks = vi.hoisted(() => ({ userAgent: undefined as string | undefined, useHead: vi.fn() }))
mockNuxtImport('useHead', () => mocks.useHead)
mockNuxtImport('useRequestHeaders', () => () => ({ 'user-agent': mocks.userAgent }))

function run(userAgent: string | undefined) {
  mocks.userAgent = userAgent
  ;(plugin as unknown as () => void)()
}

describe('pwa server plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['Android Chrome', UA.androidChrome],
    ['Android Firefox — it looks only at load', UA.androidFirefox],
    ['iOS Safari', UA.iPhoneSafari],
  ])('renders the manifest into the page for %s', (_label, userAgent) => {
    run(userAgent)
    expect(mocks.useHead).toHaveBeenCalledWith({ link: pwaHeadLinks() })
  })

  it.each([
    ['a desktop browser', UA.windowsChrome],
    ['a request without user agent', undefined],
  ])('renders nothing for %s', (_label, userAgent) => {
    run(userAgent)
    expect(mocks.useHead).not.toHaveBeenCalled()
  })

  it('keys the tags, so the client adds no second copy', () => {
    expect(pwaHeadLinks().map((link) => link.key)).toStrictEqual(['pwa-manifest', 'pwa-icon'])
  })
})
