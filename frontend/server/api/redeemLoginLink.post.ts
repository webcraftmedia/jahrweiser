import { z } from 'zod'
import ICAL from 'ical.js'

import {
  findUserByToken,
  saveUser,
  X_LOGIN_DISABLED,
  X_LOGIN_REQUEST_TIME,
  X_LOGIN_TIME,
  X_LOGIN_TOKEN,
  X_ROLE,
} from '../helpers/dav'

const bodySchema = z.object({
  token: z.string(),
})

export const MAX_AGE = 60 * 60 * 24 * 7

const config = useRuntimeConfig()

export default defineEventHandler(async (event) => {
  const { token } = await readValidatedBody(event, bodySchema.parse)
  // check token in dav
  const addressbooks = await findUserByToken(config, token)

  if (addressbooks.length !== 1) {
    console.log('user not found')
    throw createError({
      statusCode: 401,
      message: 'Bad credentials',
    })
  }

  const vcard = new ICAL.Component(ICAL.parse(addressbooks[0].props?.addressData))

  const isDisabled = vcard.getFirstPropertyValue(X_LOGIN_DISABLED) as string
  if (isDisabled === 'true') {
    console.log('account disabled')
    throw createError({
      statusCode: 401,
      message: 'Bad credentials',
    })
  }

  // Remove token & login restriction
  vcard.removeAllProperties(X_LOGIN_REQUEST_TIME)
  vcard.removeAllProperties(X_LOGIN_TOKEN)
  vcard.updatePropertyWithValue(X_LOGIN_TIME, Date.now())

  const href = addressbooks[0].href as string
  const etag = addressbooks[0].props?.getetag
  await saveUser(config, href, etag, vcard.toString())

  const name = vcard.getFirstProperty('fn')?.getValues()[0]
  const email = vcard.getFirstProperty('email')?.getValues()[0]

  const role = vcard.getFirstProperty(X_ROLE)?.getValues()[0] ?? 'user'

  // create session
  await setUserSession(
    event,
    {
      user: {
        name,
        email,
        role,
      },
    },
    { maxAge: MAX_AGE },
  )
  return {}
})
