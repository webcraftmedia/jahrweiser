import ICAL from 'ical.js'

interface MockVCardOptions {
  email?: string
  fn?: string
  disabled?: string
  token?: string
  requestTime?: number
  role?: string
  categories?: string[]
  adminTags?: string
}

export function createMockVCard(options: MockVCardOptions = {}): ICAL.Component {
  const vcard = new ICAL.Component('vcard')
  if (options.email) vcard.addPropertyWithValue('email', options.email)
  if (options.fn) vcard.addPropertyWithValue('fn', options.fn)
  if (options.disabled !== undefined)
    vcard.addPropertyWithValue('x-login-disabled', options.disabled)
  if (options.token) vcard.addPropertyWithValue('x-login-token', options.token)
  if (options.requestTime !== undefined)
    vcard.addPropertyWithValue('x-login-request-time', options.requestTime)
  if (options.role) vcard.addPropertyWithValue('x-role', options.role)
  if (options.categories) {
    vcard.addPropertyWithValue('categories', '')
    vcard.getFirstProperty('categories')?.setValues(options.categories)
  }
  if (options.adminTags) {
    // X-ADMIN-TAGS is a comma-separated text list (registered in
    // server/helpers/dav.ts), so build it as real multiple values rather than
    // one string that happens to contain commas.
    vcard.addPropertyWithValue('x-admin-tags', '')
    vcard.getFirstProperty('x-admin-tags')!.setValues(options.adminTags.split(','))
  }
  return vcard
}
