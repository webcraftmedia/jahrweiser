// @vitest-environment node
import '../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import deleteHandler from './delete.post'
import uploadHandler from './upload.post'

import type { BlaettchenIssue } from '~~/shared/blaettchen'

// Both handlers refuse a name that could leave the issue directory, and both
// check again after resolving the path. That second guard is unreachable while
// the grammar holds — overriding the parser is the only way to prove it is a
// guard rather than dead code.
const shared = vi.hoisted(() => ({
  parseOverride: null as null | ((file: string) => unknown),
}))
vi.mock('~~/shared/blaettchen', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/shared/blaettchen')>()
  return {
    ...actual,
    parseBlaettchenFile: (file: string) =>
      shared.parseOverride ? shared.parseOverride(file) : actual.parseBlaettchenFile(file),
  }
})

const fs = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
}))
vi.mock('node:fs/promises', () => fs)

const uploadFn = uploadHandler as unknown as (
  event: unknown,
) => Promise<{ issue: BlaettchenIssue; replaced: string[] }>
const deleteFn = deleteHandler as unknown as (event: unknown) => Promise<unknown>

const PDF = Buffer.from('%PDF-1.4 a real issue')

function asAdmin(): void {
  vi.mocked(globalThis.requireUserSession).mockResolvedValue({
    user: { uid: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' },
  })
}
function asUser(): void {
  vi.mocked(globalThis.requireUserSession).mockResolvedValue({
    user: { uid: 'u1', name: 'User', email: 'user@example.com', role: 'user' },
  })
}

/** The multipart parts h3 hands the upload handler. */
function sending(
  fields: Record<string, string>,
  file: { data?: Buffer; filename?: string | null } = {},
): void {
  const { data = PDF, filename = 'irgendwas.pdf' } = file
  const parts = Object.entries(fields).map(([name, value]) => ({
    name,
    data: Buffer.from(value, 'utf-8'),
  }))
  vi.mocked(globalThis.readMultipartFormData).mockResolvedValue([
    ...parts,
    ...(filename === null ? [] : [{ name: 'file', filename, type: 'application/pdf', data }]),
  ])
}

function body(value: Record<string, unknown>): void {
  vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, validate) =>
    (validate as (data: unknown) => unknown)(value),
  )
}

/** What `writeFile` was called with, as [name, bytes]. */
function written(): [string, Buffer] {
  const call = fs.writeFile.mock.calls[0] as [string, Buffer]
  return [call[0].split('/').pop()!, call[1]]
}

describe('admin/blaettchen/upload.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asAdmin()
    fs.readdir.mockResolvedValue([])
    fs.mkdir.mockResolvedValue(undefined)
    fs.writeFile.mockResolvedValue(undefined)
    fs.unlink.mockResolvedValue(undefined)
    sending({ number: '13', date: '2026-09-01' })
  })

  it('refuses anyone who is not an admin', async () => {
    asUser()
    await expect(uploadFn({})).rejects.toThrow('Not Authorized')
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('refuses an anonymous request', async () => {
    vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(uploadFn({})).rejects.toThrow('Unauthorized')
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('names the file itself rather than trusting the browser', async () => {
    // The upload was called "irgendwas.pdf"; what lands on disk follows the
    // convention, because that is what the listing can read back.
    const result = await uploadFn({})
    expect(written()).toStrictEqual(['13_2026-09-01.pdf', PDF])
    expect(result.issue).toStrictEqual({
      number: 13,
      date: '2026-09-01',
      file: '13_2026-09-01.pdf',
    })
    expect(result.replaced).toStrictEqual([])
  })

  it('pads a single-digit number so the archive sorts as text too', async () => {
    sending({ number: '6', date: '2024-04-14' })
    await uploadFn({})
    expect(written()[0]).toBe('06_2024-04-14.pdf')
  })

  it('appends the optional subtitle, spaces and umlauts included', async () => {
    sending({ number: '14', date: '2026-12-24', title: 'Sonderausgabe Weihnachten' })
    await uploadFn({})
    expect(written()[0]).toBe('14_2026-12-24_Sonderausgabe Weihnachten.pdf')
  })

  it('drops a subtitle that is only whitespace instead of writing a dangling separator', async () => {
    sending({ number: '14', date: '2026-12-24', title: '   ' })
    await uploadFn({})
    expect(written()[0]).toBe('14_2026-12-24.pdf')
  })

  it('creates the archive directory on the very first upload', async () => {
    await uploadFn({})
    expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('data/blaettchen'), {
      recursive: true,
    })
  })

  it.each([
    [{ number: '13', date: '2026-02-30' }, 'a day February does not have'],
    [{ number: '13', date: '01.09.2026' }, 'a German date'],
    [{ number: '13', date: '' }, 'no date at all'],
    [{ number: '0', date: '2026-09-01' }, 'issue zero'],
    [{ number: '1000', date: '2026-09-01' }, 'a four-digit number'],
    [{ number: 'zwölf', date: '2026-09-01' }, 'a spelled-out number'],
    [{ date: '2026-09-01' }, 'a missing number'],
    [{ number: '13', date: '2026-09-01', title: 'a/b' }, 'a subtitle with a separator'],
    [{ number: '13', date: '2026-09-01', title: 'a\\b' }, 'a subtitle with a backslash'],
  ])('rejects %o (%s)', async (fields) => {
    sending(fields)
    await expect(uploadFn({})).rejects.toThrow('Invalid issue data')
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('rejects a request without a file', async () => {
    sending({ number: '13', date: '2026-09-01' }, { filename: null })
    await expect(uploadFn({})).rejects.toThrow('No file')
  })

  it('rejects a request that is not multipart at all', async () => {
    vi.mocked(globalThis.readMultipartFormData).mockResolvedValue(undefined)
    await expect(uploadFn({})).rejects.toThrow('No file')
  })

  it('rejects a plain text field that merely calls itself "file"', async () => {
    // Only a part with a file name is an upload; a field named `file` is not.
    vi.mocked(globalThis.readMultipartFormData).mockResolvedValue([
      { name: 'number', data: Buffer.from('13') },
      { name: 'date', data: Buffer.from('2026-09-01') },
      { name: 'file', data: Buffer.from('%PDF-1.4') },
    ])
    await expect(uploadFn({})).rejects.toThrow('No file')
  })

  it('rejects an empty file', async () => {
    sending({ number: '13', date: '2026-09-01' }, { data: Buffer.alloc(0) })
    await expect(uploadFn({})).rejects.toThrow('No file')
  })

  it('rejects anything that is not a PDF, whatever the content type claims', async () => {
    // The part is declared application/pdf — only the magic bytes decide.
    sending({ number: '13', date: '2026-09-01' }, { data: Buffer.from('<?php echo 1; ?>') })
    await expect(uploadFn({})).rejects.toThrow('Not a PDF')
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('rejects a file beyond the proxy limit instead of writing it', async () => {
    // Larger than BLAETTCHEN_MAX_BYTES; nginx would cut it off anyway.
    const huge = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)])
    sending({ number: '13', date: '2026-09-01' }, { data: huge })
    await expect(uploadFn({})).rejects.toThrow('File too large')
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  describe('an issue number that is already taken', () => {
    beforeEach(() => {
      fs.readdir.mockResolvedValue(['12_2026-05-01.pdf', '13_2026-08-02_Entwurf.pdf'])
      sending({ number: '13', date: '2026-09-01' })
    })

    it('refuses without the explicit replace flag', async () => {
      await expect(uploadFn({})).rejects.toThrow('Issue already exists')
      expect(fs.writeFile).not.toHaveBeenCalled()
      expect(fs.unlink).not.toHaveBeenCalled()
    })

    it('refuses when the flag says false', async () => {
      sending({ number: '13', date: '2026-09-01', replace: 'false' })
      await expect(uploadFn({})).rejects.toThrow('Issue already exists')
    })

    it('replaces on request, removing the differently named predecessor', async () => {
      // Two files claiming to be the 13th would read as duplicates.
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      sending({ number: '13', date: '2026-09-01', replace: 'true' })
      const result = await uploadFn({})
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('13_2026-08-02_Entwurf.pdf'))
      expect(written()[0]).toBe('13_2026-09-01.pdf')
      expect(result.replaced).toStrictEqual(['13_2026-08-02_Entwurf.pdf'])
      // Destroying an issue leaves a trace; the archive has no other history.
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('admin@example.com'),
        expect.stringContaining('13_2026-08-02_Entwurf.pdf'),
      )
      consoleSpy.mockRestore()
    })

    it('overwrites in place when the name is unchanged, without unlinking first', async () => {
      // Deleting the file we are about to write would only risk losing both.
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      sending({ number: '13', date: '2026-08-02', title: 'Entwurf', replace: 'true' })
      await uploadFn({})
      expect(fs.unlink).not.toHaveBeenCalled()
      expect(written()[0]).toBe('13_2026-08-02_Entwurf.pdf')
      consoleSpy.mockRestore()
    })

    it('leaves other issues alone', async () => {
      sending({ number: '13', date: '2026-09-01', replace: 'true' })
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      await uploadFn({})
      expect(fs.unlink).not.toHaveBeenCalledWith(expect.stringContaining('12_2026-05-01.pdf'))
      consoleSpy.mockRestore()
    })
  })

  it('ignores files in the directory that are not issues when looking for clashes', async () => {
    fs.readdir.mockResolvedValue(['.DS_Store', 'Entwurf.pdf'])
    await expect(uploadFn({})).resolves.toBeTruthy()
  })
})

describe('admin/blaettchen/delete.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asAdmin()
    fs.unlink.mockResolvedValue(undefined)
    body({ file: '12_2026-05-01.pdf' })
    shared.parseOverride = null
  })

  it('refuses anyone who is not an admin', async () => {
    asUser()
    await expect(deleteFn({})).rejects.toThrow('Not Authorized')
    expect(fs.unlink).not.toHaveBeenCalled()
  })

  it('removes the issue and records who did it', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(deleteFn({})).resolves.toStrictEqual({})
    expect(fs.unlink).toHaveBeenCalledWith(
      expect.stringContaining('data/blaettchen/12_2026-05-01.pdf'),
    )
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('admin@example.com'))
    consoleSpy.mockRestore()
  })

  it.each([
    ['../../nuxt.config.ts', 'a traversal'],
    ['telegram-channels.json', 'a neighbouring config file'],
    ['Entwurf.pdf', 'a file that is not an issue'],
  ])('answers 404 for %s (%s) without touching the file system', async (file) => {
    body({ file })
    await expect(deleteFn({})).rejects.toThrow('Blaettchen issue not found')
    expect(fs.unlink).not.toHaveBeenCalled()
  })

  it('fails closed if a future name grammar ever allowed a separator through', async () => {
    shared.parseOverride = () => ({
      number: 1,
      date: '2023-01-01',
      file: '../../nuxt.config.ts',
    })
    await expect(deleteFn({})).rejects.toThrow('Blaettchen issue not found')
    expect(fs.unlink).not.toHaveBeenCalled()
  })

  it('answers 404 for an issue that is already gone', async () => {
    const missing = new Error('no such file') as NodeJS.ErrnoException
    missing.code = 'ENOENT'
    fs.unlink.mockRejectedValue(missing)
    await expect(deleteFn({})).rejects.toThrow('Blaettchen issue not found')
  })

  it('fails loudly when the file exists but cannot be removed', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const denied = new Error('permission denied') as NodeJS.ErrnoException
    denied.code = 'EACCES'
    fs.unlink.mockRejectedValue(denied)
    await expect(deleteFn({})).rejects.toThrow('Blaettchen issue not deletable')
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete'),
      expect.anything(),
    )
    consoleSpy.mockRestore()
  })
})
