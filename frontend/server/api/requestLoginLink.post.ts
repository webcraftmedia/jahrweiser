import path from 'node:path'

import { z } from 'zod'

import {
  createCardDAVAccount,
  findUserByEmail,
  saveUser,
  X_LOGIN_DISABLED,
  X_LOGIN_REQUEST_TIME,
  X_LOGIN_TOKEN,
} from '../helpers/dav'
import { defaultParams, emailRenderer } from '../helpers/email'

const bodySchema = z.object({
  email: z.email(),
})

export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, bodySchema.parse)

  const config = useRuntimeConfig()

  // check if email in dav
  const cardDavAccount = createCardDAVAccount(config)
  const query = await findUserByEmail(cardDavAccount, email)

  if (!query) {
    console.warn('user not found')
    return {}
  }

  const { user, vcard } = query

  const now = Date.now()

  const REQUEST_TIMEOUT = 60000

  const isDisabled = vcard.getFirstPropertyValue(X_LOGIN_DISABLED) as string
  if (isDisabled === 'true') {
    console.warn('account disabled')
    return {}
  }

  const lastRequest = vcard.getFirstPropertyValue(X_LOGIN_REQUEST_TIME) as string
  if (new Date(parseInt(lastRequest) + REQUEST_TIMEOUT) >= new Date(now)) {
    console.warn('too many requests')
    return {}
  }

  const authtoken = crypto.randomUUID()

  vcard.updatePropertyWithValue(X_LOGIN_REQUEST_TIME, now)
  vcard.updatePropertyWithValue(X_LOGIN_TOKEN, authtoken)

  await saveUser(cardDavAccount, user, vcard)

  // send email with link
  const name = vcard.getFirstPropertyValue('fn')

  const to = { address: email, name: name?.toString() ?? '' }
  try {
    await emailRenderer.send({
      template: path.join(process.cwd(), 'server/emails/requestLoginLink'),
      message: {
        to,
      },
      locals: {
        ...defaultParams,
        locale: 'de',
        name,
        authURL: new URL(`/login/${authtoken}`, config.CLIENT_URI),
      },
    })
  } catch (error) {
    throw new Error(error as string)
  }

  // Always return success
  return {}
})
