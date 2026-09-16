// @vitest-environment node
import '../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import handler from './[file].get'

const mockReadFile = vi.fn()
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}))

// The handler's second line of defence only fires if the name grammar ever
// lets a separator through, which by construction it cannot. Making the parser
// overridable is the only way to exercise that guard — and the only way to
// prove it is a guard rather than dead code.
const shared = vi.hoisted(() => ({
  parseOverride: null as null | ((file: string) => unknown),
}))
vi.mock('../../../shared/blaettchen', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/blaettchen')>()
  return {
    ...actual,
    parseBlaettchenFile: (file: string) =>
      shared.parseOverride ? shared.parseOverride(file) : actual.parseBlaettchenFile(file),
  }
})

const handlerFn = handler as unknown as (event: unknown) => Promise<Buffer>

const PDF = Buffer.from('%PDF-1.4 …')

/** Drives the `[file]` route parameter the way h3 hands it to the handler. */
function requesting(file: string | undefined): void {
  vi.mocked(globalThis.getRouterParam).mockReturnValue(file)
}

function headers(): Record<string, string> {
  return Object.fromEntries(
    vi.mocked(globalThis.setHeader).mock.calls.map(([, name, value]) => [name, value as string]),
  )
}

describe('blaettchen/[file].get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'User', email: 'user@example.com', role: 'user' },
    })
    mockReadFile.mockResolvedValue(PDF)
    requesting('11_2025-12-24.pdf')
    shared.parseOverride = null
  })

  it('requires a session — a direct link must not bypass the login', async () => {
    vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(handlerFn({})).rejects.toThrow('Unauthorized')
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('serves the PDF from the configured directory', async () => {
    await expect(handlerFn({})).resolves.toBe(PDF)
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('data/blaettchen/11_2025-12-24.pdf'),
    )
  })

  it('declares the PDF as a PDF and keeps it out of shared caches', async () => {
    await handlerFn({})
    const sent = headers()
    expect(sent['Content-Type']).toBe('application/pdf')
    // Member-only content: no proxy and no bfcache copy after logout.
    expect(sent['Cache-Control']).toBe('private, no-store')
    expect(sent['X-Content-Type-Options']).toBe('nosniff')
  })

  it('offers an ASCII download name that says which issue it is', async () => {
    requesting('04_2023-12-23_Sonderausgabe Weihnachten.pdf')
    await handlerFn({})
    // No umlauts, no quoting, no RFC 5987 dance — and still identifiable in
    // the download folder.
    expect(headers()['Content-Disposition']).toBe('inline; filename="Blaettchen-04-2023-12-23.pdf"')
  })

  it.each([
    ['../../../etc/passwd', 'a bare traversal'],
    ['01_2023-06-06_../../etc/passwd.pdf', 'a traversal smuggled into the title'],
    ['/etc/shadow.pdf', 'an absolute path'],
    ['telegram-channels.json', 'a neighbouring config file'],
    ['Entwurf.pdf', 'a file that is not an issue'],
  ])('answers 404 for %s (%s) without touching the file system', async (file) => {
    requesting(file)
    await expect(handlerFn({})).rejects.toThrow('Blaettchen issue not found')
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('fails closed if a future name grammar ever allowed a separator through', async () => {
    // Simulates exactly that: a parser that accepts a name pointing outside the
    // issue directory. The handler must still refuse to read it.
    shared.parseOverride = () => ({
      number: 1,
      date: '2023-01-01',
      file: '../../nuxt.config.ts',
    })
    await expect(handlerFn({})).rejects.toThrow('Blaettchen issue not found')
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('answers 404 when the route parameter is missing entirely', async () => {
    requesting(undefined)
    await expect(handlerFn({})).rejects.toThrow('Blaettchen issue not found')
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('answers 404 for an issue that has since been removed', async () => {
    // An old link is an ordinary not-found, not a server fault.
    const missing = new Error('no such file') as NodeJS.ErrnoException
    missing.code = 'ENOENT'
    mockReadFile.mockRejectedValue(missing)
    await expect(handlerFn({})).rejects.toThrow('Blaettchen issue not found')
  })

  it('fails loudly when the file exists but cannot be read', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const denied = new Error('permission denied') as NodeJS.ErrnoException
    denied.code = 'EACCES'
    mockReadFile.mockRejectedValue(denied)
    await expect(handlerFn({})).rejects.toThrow('Blaettchen issue unreadable')
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read'),
      expect.anything(),
    )
    consoleSpy.mockRestore()
  })

  it('decodes the route parameter, because issue names contain spaces', async () => {
    await handlerFn({})
    expect(globalThis.getRouterParam).toHaveBeenCalledWith({}, 'file', { decode: true })
  })
})
