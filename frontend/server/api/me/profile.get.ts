import { readPostalCode, readVCardName, splitDisplayName } from '../../helpers/contactName'
import { createCardDAVAccount, findUserByEmail } from '../../helpers/dav'

// Current user's editable contact data. DAV is the source of truth, so read
// first/last name and postal code from the user's VCard; fall back to splitting
// the session's display name if the contact isn't in DAV (rare).
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const config = useRuntimeConfig()
  const account = createCardDAVAccount(config)

  const match = await findUserByEmail(account, session.user.email)
  if (match) {
    return { ...readVCardName(match.vcard), postalCode: readPostalCode(match.vcard) }
  }
  return { ...splitDisplayName(session.user.name ?? ''), postalCode: '' }
})
