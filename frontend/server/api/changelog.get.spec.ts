// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReadFileSync = vi.fn()

vi.mock('node:fs', () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}))

describe('changelog.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns changelog content from file', async () => {
    mockReadFileSync.mockReturnValue('## 1.0.0\n\nChanges here')
    const { default: freshHandler } = await import('./changelog.get')
    const fn = freshHandler as unknown as (event: unknown) => string
    const result = fn({})
    expect(result).toBe('## 1.0.0\n\nChanges here')
  })

  it('returns fallback when file not found', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    const { default: freshHandler } = await import('./changelog.get')
    const fn = freshHandler as unknown as (event: unknown) => string
    const result = fn({})
    expect(result).toContain('No changelog available')
  })

  it('caches the result on subsequent calls', async () => {
    mockReadFileSync.mockReturnValue('## 2.0.0\n\nCached')
    const { default: freshHandler } = await import('./changelog.get')
    const fn = freshHandler as unknown as (event: unknown) => string
    fn({})
    fn({})
    expect(mockReadFileSync).toHaveBeenCalledTimes(1)
  })
})
