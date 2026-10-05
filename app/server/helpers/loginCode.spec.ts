// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  LOGIN_CODE_COOKIE,
  LOGIN_CODE_TTL_MS,
  bindLoginCode,
  clearLoginCodeBinding,
  codeHashOf,
  codeKeyOf,
  generateLoginCode,
  readLoginCodeNonce,
} from './loginCode'

const DEV = { CLIENT_URI: 'http://localhost:3000' }

describe('loginCode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates six digits, keeping leading zeros', () => {
    for (let i = 0; i < 200; i++) expect(generateLoginCode()).toMatch(/^\d{6}$/)
  })

  it('hashes the code with the nonce, so the table alone cannot recover it', () => {
    expect(codeHashOf('a', '123456')).not.toBe(codeHashOf('b', '123456'))
    expect(codeHashOf('a', '123456')).toMatch(/^[0-9a-f]{64}$/)
    expect(codeKeyOf('a')).not.toBe(codeHashOf('a', ''))
  })

  it('binds a fresh nonce to an httpOnly cookie scoped to the redeem endpoint', () => {
    const event = {}
    const first = bindLoginCode(event as never, DEV)
    const second = bindLoginCode(event as never, DEV)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(second).not.toBe(first)
    expect(globalThis.setCookie).toHaveBeenCalledWith(event, LOGIN_CODE_COOKIE, first, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/api/redeemLoginCode',
      maxAge: LOGIN_CODE_TTL_MS / 1000,
    })
  })

  it('marks the cookie secure where the app is served over https', () => {
    bindLoginCode({} as never, { CLIENT_URI: 'https://jahrweiser.example' })
    expect(vi.mocked(globalThis.setCookie).mock.calls[0]![3]).toMatchObject({ secure: true })
  })

  it('reads the nonce back, treating an empty cookie as none', () => {
    vi.mocked(globalThis.getCookie).mockReturnValueOnce('n1').mockReturnValueOnce('')
    expect(readLoginCodeNonce({} as never)).toBe('n1')
    expect(readLoginCodeNonce({} as never)).toBeUndefined()
  })

  it('clears the cookie on the same path it was set on', () => {
    clearLoginCodeBinding({} as never)
    expect(globalThis.deleteCookie).toHaveBeenCalledWith({}, LOGIN_CODE_COOKIE, {
      path: '/api/redeemLoginCode',
    })
  })
})
