// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi } from 'vitest'

import { mockDb } from '../../test/helpers/mock-db'

// Safety net only — handlers open the DB lazily inside the request handler, not
// at import time, so this mock just guards against accidental top-level usage.
vi.mock('../db', () => ({ useDb: () => mockDb }))

// Import every route handler so a load-time error (bad import path, missing
// module, syntax error) fails fast in the unit job — including the handlers
// excluded from line/branch coverage. This is exactly the class of bug that a
// wrong relative import (`./db` vs `../db`) produces.
const handlers = Object.entries(import.meta.glob('./**/*.{get,post}.ts'))

describe('server/api route handlers load without error', () => {
  it.each(handlers)('imports %s', async (_path, load) => {
    const mod = (await load()) as { default?: unknown }
    expect(mod.default).toBeDefined()
  })
})
