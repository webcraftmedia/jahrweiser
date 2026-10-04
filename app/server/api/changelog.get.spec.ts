// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { Changelog } from '../../shared/changelog'

const mockReadFile = vi.fn()

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}))

function errnoError(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(code)
  error.code = code
  return error
}

describe('changelog.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns the parsed changelog, limited to the latest minor releases', async () => {
    const md = Array.from({ length: 7 }, (_, i) => `## 1.${7 - i}.0 (2026-01-0${i + 1})\n`)
    mockReadFile.mockResolvedValue(md.join('\n'))
    const { default: freshHandler } = await import('./changelog.get')
    const fn = freshHandler as unknown as (event: unknown) => Promise<Changelog>
    const result = await fn({})
    expect(result.releases.map((release) => release.version)).toStrictEqual([
      '1.7',
      '1.6',
      '1.5',
      '1.4',
      '1.3',
    ])
    expect(result.older).toBe(2)
  })

  it('returns an empty changelog when the file is missing', async () => {
    mockReadFile.mockRejectedValue(errnoError('ENOENT'))
    const { default: freshHandler } = await import('./changelog.get')
    const fn = freshHandler as unknown as (event: unknown) => Promise<Changelog>
    await expect(fn({})).resolves.toStrictEqual({ releases: [], older: 0 })
  })

  it('propagates errors that are not a missing file', async () => {
    mockReadFile.mockRejectedValue(errnoError('EACCES'))
    const { default: freshHandler } = await import('./changelog.get')
    const fn = freshHandler as unknown as (event: unknown) => Promise<Changelog>
    await expect(fn({})).rejects.toThrow('EACCES')
  })

  it('caches the result on subsequent calls', async () => {
    mockReadFile.mockResolvedValue('## 2.0.0\n\nCached')
    const { default: freshHandler } = await import('./changelog.get')
    const fn = freshHandler as unknown as (event: unknown) => Promise<Changelog>
    await fn({})
    await fn({})
    expect(mockReadFile).toHaveBeenCalledTimes(1)
  })
})
