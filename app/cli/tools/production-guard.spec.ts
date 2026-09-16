// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { assertLocalEnv } from './production-guard'

describe('assertLocalEnv', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  const originalEnv = { ...process.env }

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('passes for localhost DAV + localhost DB', () => {
    assertLocalEnv({ davUrl: 'http://localhost:8088', dbHost: 'localhost' })
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('passes for docker-internal hostnames (baikal, mariadb)', () => {
    assertLocalEnv({ davUrl: 'http://baikal/dav.php', dbHost: 'mariadb' })
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('passes when DB host is missing (falls back to localhost default)', () => {
    assertLocalEnv({ davUrl: 'http://localhost:8088' })
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('refuses for non-local DAV URL', () => {
    assertLocalEnv({ davUrl: 'https://baikal.it4c.dev', dbHost: 'localhost' })
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('refuses for non-local DB host', () => {
    assertLocalEnv({ davUrl: 'http://localhost:8088', dbHost: 'prod-db.example.com' })
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('refuses when both are non-local', () => {
    assertLocalEnv({ davUrl: 'https://prod.example.com', dbHost: 'prod-db.example.com' })
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('allows non-local resources when ALLOW_PRODUCTION=1 is set', () => {
    process.env.ALLOW_PRODUCTION = '1'
    assertLocalEnv({ davUrl: 'https://baikal.it4c.dev', dbHost: 'prod-db.example.com' })
    expect(exitSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('ignores ALLOW_PRODUCTION values other than "1"', () => {
    process.env.ALLOW_PRODUCTION = 'true'
    assertLocalEnv({ davUrl: 'https://baikal.it4c.dev', dbHost: 'localhost' })
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
