import { createCardDAVAccount, findUserByEmail, saveUser, X_ROLE } from '../server/helpers/dav'
import { config } from './tools/config'
import { check as checkEmail } from './tools/email'

const email = process.argv[2]

checkEmail(email)

console.log(`Allow admin priviledge for ${email}.`)

const cardDavAccount = createCardDAVAccount(config)
const query = await findUserByEmail(cardDavAccount, email)

if (!query) {
  console.error('User with given email not found in dav endpoint')
  process.exit(1)
}

const { user, vcard } = query
vcard.updatePropertyWithValue(X_ROLE, 'admin')

await saveUser(cardDavAccount, user, vcard)
