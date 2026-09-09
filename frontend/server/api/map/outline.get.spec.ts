// @vitest-environment node
import '../../../test/setup-server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './outline.get'

import type { MapOutline } from '../../../shared/map'

const mockLoadPlzAreas = vi.fn()
vi.mock('../../helpers/memberMap', () => ({ loadPlzAreas: () => mockLoadPlzAreas() }))

const fn = handler as unknown as (e: unknown) => Promise<MapOutline>

describe('map/outline.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'A', email: 'a@x.de', role: 'user' },
    })
  })

  it('requires a session', async () => {
    vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(fn({})).rejects.toThrow('Unauthorized')
  })

  it('answers the silhouette together with the coordinate system', async () => {
    // The two must travel together: a client holding yesterday's viewBox would
    // draw today's areas kilometres off.
    mockLoadPlzAreas.mockResolvedValue({
      viewBox: '0 0 12000 16295',
      outline: 'M0 0l1 0z',
      areas: new Map(),
    })
    await expect(fn({})).resolves.toStrictEqual({ viewBox: '0 0 12000 16295', d: 'M0 0l1 0z' })
  })

  it('is not behind the postal-code gate — the locked preview needs it too', async () => {
    mockLoadPlzAreas.mockResolvedValue({ viewBox: '0 0 1 1', outline: '', areas: new Map() })
    await expect(fn({})).resolves.toBeDefined()
    // No DB lookup of the caller's own postal code happened.
    expect(globalThis.requireUserSession).toHaveBeenCalledTimes(1)
  })

  it('fails loudly when the artefact was never built', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockLoadPlzAreas.mockResolvedValue(null)
    await expect(fn({})).rejects.toThrow('Map data unavailable')
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
