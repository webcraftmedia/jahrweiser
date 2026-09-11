// @vitest-environment node
import '../../../test/setup-server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './postal-code.get'

import type { PostalCodeLookup } from '../../../shared/map'

const mockLoadPlzAreas = vi.fn()
vi.mock('../../helpers/memberMap', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPlzAreas: () => mockLoadPlzAreas(),
}))

const GEOMETRY = {
  viewBox: '0 0 4000 5000',
  outline: 'M0 0l1 0z',
  areas: new Map([
    ['64673', { o: 'Zwingenberg', d: 'M0 0l1 0z', c: [1, 2] as [number, number], s: 9 }],
  ]),
}

const fn = handler as unknown as (e: unknown) => Promise<PostalCodeLookup>

/** The handler reads its query through h3's `getQuery`, which the setup stubs. */
function asking(plz: unknown) {
  vi.mocked(globalThis.getQuery).mockReturnValue({ plz })
  return fn({})
}

describe('map/postal-code.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadPlzAreas.mockResolvedValue(GEOMETRY)
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'A', email: 'a@x.de', role: 'user' },
    })
  })

  it('requires a session, like everything else on the map', async () => {
    vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(asking('64673')).rejects.toThrow('Unauthorized')
  })

  it('names the place behind a code it knows', async () => {
    // The confirmation is the point: five digits that are real but a hundred
    // kilometres off is the mistake a format check cannot catch.
    await expect(asking('64673')).resolves.toStrictEqual({
      known: true,
      plz: '64673',
      ort: 'Zwingenberg',
    })
  })

  it('normalises what a DAV client or a careless keyboard produced', async () => {
    await expect(asking(' D-64673 ')).resolves.toMatchObject({ known: true, plz: '64673' })
  })

  it.each([
    ['a code no area matches', '99999'],
    ['too few digits', '6467'],
    ['nothing at all', ''],
    ['a foreign code', 'CH-8001'],
  ])('answers "unknown" for %s, not an error', async (_case, plz) => {
    // A field state, not a failure: the form has to tell the two apart, and a
    // rejected promise here would look exactly like the endpoint being down.
    await expect(asking(plz)).resolves.toStrictEqual({ known: false, plz: null, ort: null })
  })

  it('refuses something that is not a postal code at all', async () => {
    await expect(asking('x'.repeat(17))).rejects.toThrow()
  })

  it('fails loudly when the artefact was never built', async () => {
    // The form treats the failure as "could not check" and keeps saving
    // possible — the POST makes the same fallback. The log is for the operator.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockLoadPlzAreas.mockResolvedValue(null)
    await expect(asking('64673')).rejects.toThrow('Map data unavailable')
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
