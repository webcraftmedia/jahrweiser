import dotenv from 'dotenv'
import { resolve } from 'path'
import ICAL from 'ical.js'
import { findUserByEmail, saveUser, X_ROLE, type DAV_CONFIG } from '../server/helpters/dav'

const email = process.argv[2]
const revoke = !!process.argv[3]

if (!email) {
  console.error('Fehler: Keine E-Mail-Adresse angegeben')
  process.exit(1)
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

if (!emailRegex.test(email)) {
  console.error('Fehler: Ungültige E-Mail-Adresse')
  process.exit(1)
}

console.log(
  revoke ? `Revoking admin priviledge for ${email}.` : `Allow admin priviledge for ${email}.`,
)

const nuxtConfig = dotenv.config({ path: resolve(process.cwd(), '.env') }).parsed as object
const config = {} as DAV_CONFIG
Object.keys(nuxtConfig).forEach((key) => {
  config[key.replace('NUXT_', '')] = nuxtConfig[key]
})

const users = await findUserByEmail(config, email)

if (users.length !== 1) {
  console.error('User with given email not found in dav endpoint')
  process.exit(1)
}

const user = users[0]!
const vcard = new ICAL.Component(ICAL.parse(user.props?.addressData))

if (revoke) {
  vcard.removeProperty(X_ROLE)
} else {
  vcard.updatePropertyWithValue(X_ROLE, 'admin')
}

const href = user.href as string
const etag = user.props?.getetag

await saveUser(config, href, etag, vcard.toString())
