// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import handler from './telegram-channels.get'

const mockReadFile = vi.fn()
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}))

const handlerFn = handler as unknown as (event: unknown) => Promise<unknown>

/** The error shape node throws for a missing file. */
function enoent(): NodeJS.ErrnoException {
  const error = new Error('no such file') as NodeJS.ErrnoException
  error.code = 'ENOENT'
  return error
}

describe('telegram-channels.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'User', email: 'user@example.com', role: 'user' },
    })
  })

  it('requires a session — an invite link is the permission itself', async () => {
    vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(handlerFn({})).rejects.toThrow('Unauthorized')
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('returns the configured channels', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify([
        {
          name: 'Kultur-Steher',
          description: 'Orga',
          url: 'https://t.me/+AbCdEf',
          public: false,
        },
        { name: 'Info', url: 'https://t.me/info_kanal', public: true },
      ]),
    )
    await expect(handlerFn({})).resolves.toStrictEqual([
      { name: 'Kultur-Steher', description: 'Orga', url: 'https://t.me/+AbCdEf', public: false },
      { name: 'Info', url: 'https://t.me/info_kanal', public: true },
    ])
  })

  it('accepts every Telegram invitation shape', async () => {
    // Public channel, current private invite and the legacy joinchat form are
    // all plain links — no type distinction needed.
    mockReadFile.mockResolvedValue(
      JSON.stringify([
        { name: 'public', url: 'https://t.me/some_channel' },
        { name: 'private', url: 'https://t.me/+AbCdEfGhIj' },
        { name: 'legacy', url: 'https://t.me/joinchat/AbCdEfGhIj' },
      ]),
    )
    const result = (await handlerFn({})) as { name: string }[]
    expect(result.map((c) => c.name)).toStrictEqual(['public', 'private', 'legacy'])
  })

  it('treats a missing file as "not configured yet"', async () => {
    // The page then shows its empty state instead of an error.
    mockReadFile.mockRejectedValue(enoent())
    await expect(handlerFn({})).resolves.toStrictEqual([])
  })

  it('fails loudly on an unreadable file rather than pretending it is empty', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const denied = new Error('permission denied') as NodeJS.ErrnoException
    denied.code = 'EACCES'
    mockReadFile.mockRejectedValue(denied)
    await expect(handlerFn({})).rejects.toThrow('Telegram channels unreadable')
    consoleSpy.mockRestore()
  })

  it('reports a JSON syntax error against the file rather than crashing', async () => {
    // The file is hand-edited on the server; one comma too many must not
    // produce a bare 500 with no log line naming the file.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockReadFile.mockResolvedValue('[{ "name": "x", },]')
    await expect(handlerFn({})).rejects.toThrow('Telegram channels malformed')
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('is not valid JSON'),
      expect.anything(),
    )
    consoleSpy.mockRestore()
  })

  it('rejects a malformed file instead of silently dropping entries', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'no url here' }]))
    await expect(handlerFn({})).rejects.toThrow('Telegram channels malformed')
    consoleSpy.mockRestore()
  })

  it('rejects a link that does not point at Telegram', async () => {
    // Guards against a typo turning the list into an open redirect surface.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockReadFile.mockResolvedValue(
      JSON.stringify([{ name: 'evil', url: 'https://example.com/phish' }]),
    )
    await expect(handlerFn({})).rejects.toThrow('Telegram channels malformed')
    consoleSpy.mockRestore()
  })
})
