import ICAL from 'ical.js'
import { findUserByEmail, saveUser, X_ROLE } from '../server/helpers/dav'
import { config } from './tools/config'
import { check as checkEmail } from './tools/email'

const email = process.argv[2]

checkEmail(email)

console.log(`Revoking admin priviledge for ${email}.`)

const users = await findUserByEmail(config, email)

if (users.length !== 1) {
  console.error('User with given email not found in dav endpoint')
  process.exit(1)
}

const user = users[0]!
const vcard = new ICAL.Component(ICAL.parse(user.props?.addressData))

vcard.removeProperty(X_ROLE)

const href = user.href as string
const etag = user.props?.getetag

await saveUser(config, href, etag, vcard.toString())
