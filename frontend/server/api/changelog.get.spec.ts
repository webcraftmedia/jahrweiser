// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

  it('returns changelog content from file', async () => {
    mockReadFile.mockResolvedValue('## 1.0.0\n\nChanges here')
    const { default: freshHandler } = await import('./changelog.get')
    const fn = freshHandler as unknown as (event: unknown) => Promise<string>
    await expect(fn({})).resolves.toBe('## 1.0.0\n\nChanges here')
  })

  it('returns fallback when file not found', async () => {
    mockReadFile.mockRejectedValue(errnoError('ENOENT'))
    const { default: freshHandler } = await import('./changelog.get')
    const fn = freshHandler as unknown as (event: unknown) => Promise<string>
    await expect(fn({})).resolves.toContain('No changelog available')
  })

  it('propagates errors that are not a missing file', async () => {
    mockReadFile.mockRejectedValue(errnoError('EACCES'))
    const { default: freshHandler } = await import('./changelog.get')
    const fn = freshHandler as unknown as (event: unknown) => Promise<string>
    await expect(fn({})).rejects.toThrow('EACCES')
  })

  it('caches the result on subsequent calls', async () => {
    mockReadFile.mockResolvedValue('## 2.0.0\n\nCached')
    const { default: freshHandler } = await import('./changelog.get')
    const fn = freshHandler as unknown as (event: unknown) => Promise<string>
    await fn({})
    await fn({})
    expect(mockReadFile).toHaveBeenCalledTimes(1)
  })
})
