import { z } from 'zod'
import ICAL from 'ical.js'

import {
  findUserByToken,
  saveUser,
  X_LOGIN_REQUEST_TIME,
  X_LOGIN_TIME,
  X_LOGIN_TOKEN,
} from '../helpters/dav'

const bodySchema = z.object({
  token: z.string(),
})

export const MAX_AGE = 60 * 60 * 24 * 7

export default defineEventHandler(async (event) => {
  const { token } = await readValidatedBody(event, bodySchema.parse)
  // check token in dav
  const addressbooks = await findUserByToken(token)

  if (addressbooks.length !== 1) {
    console.log('user not found')
    throw createError({
      statusCode: 401,
      message: 'Bad credentials',
    })
  }

  const vcard = new ICAL.Component(ICAL.parse(addressbooks[0].props?.addressData))

  // Remove token & login restriction
  vcard.removeAllProperties(X_LOGIN_REQUEST_TIME)
  vcard.removeAllProperties(X_LOGIN_TOKEN)
  vcard.updatePropertyWithValue(X_LOGIN_TIME, Date.now())

  const href = addressbooks[0].href as string
  const etag = addressbooks[0].props?.getetag
  await saveUser(href, etag, vcard.toString())

  const name = vcard.getFirstProperty('fn')?.getValues()[0]
  const email = vcard.getFirstProperty('email')?.getValues()[0]

  // create session
  await setUserSession(
    event,
    {
      user: {
        name,
        email,
      },
    },
    { maxAge: MAX_AGE },
  )
  return {}
})
