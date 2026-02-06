import {
  createCardDAVAccount,
  findUserByEmail,
  saveUser,
  X_ADMIN_TAGS,
  X_ROLE,
} from '../server/helpers/dav'
import { config } from './tools/config'
import { check as checkEmail } from './tools/email'

const email = process.argv[2]
checkEmail(email)

// allows for arguments to be space and comma separated
const tags = process.argv.slice(3).join(',').split(',')
if (tags.length < 1) {
  console.error('You must provide at least one tag to grant')
  process.exit(1)
}

console.log(`Grant admin ${email} the following admin-tags: ${tags}.`)

const cardDavAccount = createCardDAVAccount(config)
const query = await findUserByEmail(cardDavAccount, email)

if (!query) {
  console.error('User with given email not found in dav endpoint')
  process.exit(1)
}

const { user, vcard } = query

if (vcard.getFirstPropertyValue(X_ROLE) !== 'admin') {
  console.error('User must be an admin to grant him admin tags')
  process.exit(1)
}

const oldTags = vcard.getFirstPropertyValue(X_ADMIN_TAGS)?.toString().split(',') ?? []

const newTags = [...new Set([...tags, ...oldTags])]

vcard.updatePropertyWithValue(X_ADMIN_TAGS, newTags.join(','))

console.log(`Admin ${email} now has the following admin-tags: ${newTags}`)

await saveUser(cardDavAccount, user, vcard)

process.exit(0)
