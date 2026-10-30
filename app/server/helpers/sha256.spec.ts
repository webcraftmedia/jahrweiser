// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { sha256 } from './sha256'

describe('sha256', () => {
  // The migration hashes tokens already in flight with MariaDB's SHA2(), so the
  // two have to agree on the encoding: lowercase hex, 64 characters.
  it('matches the known digest in the format SHA2(value, 256) returns', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
