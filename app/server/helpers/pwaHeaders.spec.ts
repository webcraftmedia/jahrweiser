// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { REVALIDATE_PATHS, revalidateHeader } from './pwaHeaders'

describe('revalidateHeader', () => {
  it.each(['/sw.js', '/manifest.webmanifest', '/offline.html'])('revalidates %s', (path) => {
    expect(revalidateHeader(path)).toBe('no-cache')
  })

  it('ignores a query string', () => {
    expect(revalidateHeader('/sw.js?v=2')).toBe('no-cache')
  })

  it.each(['/', '/api/me', '/_nuxt/entry.js', '/pwa/icon-192.0aa33a67.png', '/sw.js.map'])(
    'leaves %s alone',
    (path) => {
      expect(revalidateHeader(path)).toBeUndefined()
    },
  )

  it('covers exactly the three files that must never be stale', () => {
    expect([...REVALIDATE_PATHS]).toStrictEqual([
      '/sw.js',
      '/manifest.webmanifest',
      '/offline.html',
    ])
  })
})
