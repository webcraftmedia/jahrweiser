// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import handler from './blaettchen.get'

import type { BlaettchenListing } from '../../shared/blaettchen'

const mockReaddir = vi.fn()
vi.mock('node:fs/promises', () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
}))

const handlerFn = handler as unknown as (event: unknown) => Promise<BlaettchenListing>

/** The error shape node throws for a missing directory. */
function enoent(): NodeJS.ErrnoException {
  const error = new Error('no such directory') as NodeJS.ErrnoException
  error.code = 'ENOENT'
  return error
}

describe('blaettchen.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'User', email: 'user@example.com', role: 'user' },
    })
  })

  it('requires a session — the paper is written by and for the members', async () => {
    vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(handlerFn({})).rejects.toThrow('Unauthorized')
    expect(mockReaddir).not.toHaveBeenCalled()
  })

  it('lists the issues newest first, whatever order the file system returns', async () => {
    mockReaddir.mockResolvedValue([
      '05_2024-01-29.pdf',
      '12_2026-05-01.pdf',
      '04_2023-12-23_Sonderausgabe Weihnachten.pdf',
    ])
    const result = await handlerFn({})
    expect(result.issues).toStrictEqual([
      { number: 12, date: '2026-05-01', file: '12_2026-05-01.pdf' },
      { number: 5, date: '2024-01-29', file: '05_2024-01-29.pdf' },
      {
        number: 4,
        date: '2023-12-23',
        title: 'Sonderausgabe Weihnachten',
        file: '04_2023-12-23_Sonderausgabe Weihnachten.pdf',
      },
    ])
  })

  it('hands out the contact address for contributions', async () => {
    mockReaddir.mockResolvedValue([])
    // Never through runtimeConfig.public: that would put a private address into
    // the client bundle, readable without logging in.
    await expect(handlerFn({})).resolves.toHaveProperty('contact', 'redaktion@example.com')
  })

  it('reports no contact rather than an empty one when none is configured', async () => {
    const original = globalThis.useRuntimeConfig
    globalThis.useRuntimeConfig = (() => ({
      ...original(),
      BLAETTCHEN_CONTACT_EMAIL: '',
    })) as typeof globalThis.useRuntimeConfig
    mockReaddir.mockResolvedValue([])
    // The page then skips the call for contributions instead of rendering a
    // `mailto:` that goes nowhere.
    await expect(handlerFn({})).resolves.toHaveProperty('contact', null)
    globalThis.useRuntimeConfig = original
  })

  it('skips files that do not follow the convention instead of failing', async () => {
    // The directory is filled by copying files around, so a draft or a
    // .DS_Store must not take the whole archive down.
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockReaddir.mockResolvedValue(['.DS_Store', 'Entwurf.pdf', '11_2025-12-24.pdf'])
    const result = await handlerFn({})
    expect(result.issues.map((i) => i.number)).toStrictEqual([11])
    // Silently skipped issues are exactly what nobody notices — so they are logged.
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('do not follow'),
      expect.stringContaining('Entwurf.pdf'),
    )
    consoleSpy.mockRestore()
  })

  it('stays quiet when every file is a proper issue', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockReaddir.mockResolvedValue(['11_2025-12-24.pdf'])
    await handlerFn({})
    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('treats a missing directory as "nothing published yet"', async () => {
    // The page then shows its empty state and still asks for contributions.
    mockReaddir.mockRejectedValue(enoent())
    await expect(handlerFn({})).resolves.toStrictEqual({
      issues: [],
      contact: 'redaktion@example.com',
    })
  })

  it('fails loudly on an unreadable directory rather than pretending it is empty', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const denied = new Error('permission denied') as NodeJS.ErrnoException
    denied.code = 'EACCES'
    mockReaddir.mockRejectedValue(denied)
    await expect(handlerFn({})).rejects.toThrow('Blaettchen issues unreadable')
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read'),
      expect.anything(),
    )
    consoleSpy.mockRestore()
  })

  it('resolves the directory from the runtime config, not from a request', async () => {
    mockReaddir.mockResolvedValue([])
    await handlerFn({})
    expect(mockReaddir).toHaveBeenCalledWith(expect.stringContaining('data/blaettchen'))
  })
})
