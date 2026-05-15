// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { extractUserFromVCardData } from './sync'

function vcard(props: Record<string, string>): string {
  const lines = ['BEGIN:VCARD', 'VERSION:4.0']
  for (const [key, val] of Object.entries(props)) {
    lines.push(`${key.toUpperCase()}:${val}`)
  }
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

describe('extractUserFromVCardData', () => {
  it('returns null for malformed VCard data', () => {
    expect(extractUserFromVCardData('not a vcard')).toBeNull()
  })

  it('returns null when uid is missing', () => {
    const data = vcard({ fn: 'Alice', email: 'alice@example.com' })
    expect(extractUserFromVCardData(data)).toBeNull()
  })

  it('returns null when email is missing', () => {
    const data = vcard({ uid: '123', fn: 'Alice' })
    expect(extractUserFromVCardData(data)).toBeNull()
  })

  it('lowercases the email', () => {
    const data = vcard({ uid: '123', fn: 'Alice', email: 'Alice@Example.COM' })
    expect(extractUserFromVCardData(data)?.email).toBe('alice@example.com')
  })

  it('defaults role to "user" when X-ROLE is absent', () => {
    const data = vcard({ uid: '123', fn: 'Alice', email: 'alice@example.com' })
    expect(extractUserFromVCardData(data)?.role).toBe('user')
  })

  it('reads role from X-ROLE', () => {
    const data = vcard({
      uid: '123',
      fn: 'Admin',
      email: 'admin@example.com',
      'X-ROLE': 'admin',
    })
    expect(extractUserFromVCardData(data)?.role).toBe('admin')
  })

  it('treats any non-"admin" role value as "user"', () => {
    const data = vcard({
      uid: '123',
      fn: 'X',
      email: 'x@example.com',
      'X-ROLE': 'supervisor',
    })
    expect(extractUserFromVCardData(data)?.role).toBe('user')
  })

  it('parses comma-separated tags from X-ADMIN-TAGS', () => {
    const data = vcard({
      uid: '123',
      fn: 'Admin',
      email: 'admin@example.com',
      'X-ROLE': 'admin',
      'X-ADMIN-TAGS': 'veranstalter, team , ',
    })
    const result = extractUserFromVCardData(data)
    expect(result?.tags).toStrictEqual(['veranstalter', 'team'])
  })

  it('returns empty tags when X-ADMIN-TAGS is absent', () => {
    const data = vcard({ uid: '123', fn: 'A', email: 'a@example.com' })
    expect(extractUserFromVCardData(data)?.tags).toStrictEqual([])
  })

  it('captures display name from FN', () => {
    const data = vcard({ uid: '123', fn: 'Alice Example', email: 'a@example.com' })
    expect(extractUserFromVCardData(data)?.displayName).toBe('Alice Example')
  })
})
