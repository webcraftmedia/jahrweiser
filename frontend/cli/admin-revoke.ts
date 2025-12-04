import { findUserByEmail, saveUser, X_ROLE } from '../server/helpers/dav'
import { config } from './tools/config'
import { check as checkEmail } from './tools/email'

const email = process.argv[2]

checkEmail(email)

console.log(`Revoking admin priviledge for ${email}.`)

const query = await findUserByEmail(config, email)

if (!query) {
  console.error('User with given email not found in dav endpoint')
  process.exit(1)
}

const { user, vcard } = query
vcard.removeProperty(X_ROLE)

await saveUser(config, user, vcard)
