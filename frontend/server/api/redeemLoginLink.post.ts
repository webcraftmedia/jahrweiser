import { z } from 'zod'
import ICAL from 'ical.js'

import { addressBookQuery, DAVNamespaceShort, updateVCard } from 'tsdav'

const bodySchema = z.object({
  token: z.string(),
})

const MAX_AGE = 60*60*24*7

const X_LOGIN_REQUEST_TIME = 'x-login-request-time'
const X_LOGIN_TOKEN = 'x-login-token'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  const { token } = await readValidatedBody(event, bodySchema.parse)
  // check token in dav
  const addressbooks = await addressBookQuery({
    url: config.DAV_URL_CARD,
    headers: {
      authorization: 'Basic '+btoa(unescape(encodeURIComponent(config.DAV_USERNAME + ':' + config.DAV_PASSWORD))),
    },
    props: {
      [`${DAVNamespaceShort.DAV}:getetag`]: {},
      [`${DAVNamespaceShort.CARDDAV}:address-data`]: {},
    },
    depth: '1',
    filters: {
      'prop-filter': {
      _attributes: {
        name: X_LOGIN_TOKEN
      },
      'text-match': token
    }
    }
  });

  if(addressbooks.length !== 1){
    console.log('user not found')
    throw createError({
      statusCode: 401,
      message: 'Bad credentials',
    })
  }

  const vcard = new ICAL.Component(ICAL.parse(addressbooks[0].props?.addressData));


  // Remove token & login restriction
  vcard.removeAllProperties(X_LOGIN_REQUEST_TIME)
  vcard.removeAllProperties(X_LOGIN_TOKEN)

  const href = addressbooks[0].href as string
  const etag = addressbooks[0].props?.getetag
  await updateVCard({
      vCard: {
      url: 'https://baikal.it4c.dev' + href,
      data: vcard.toString(),
      etag: etag
      },
      headers: {
      authorization: 'Basic '+btoa(unescape(encodeURIComponent(config.DAV_USERNAME + ':' + config.DAV_PASSWORD))),
      }
  })
 
  const name = vcard.getFirstProperty('fn')?.getValues()[0]
  const email = vcard.getFirstProperty('email')?.getValues()[0]

  // create session
  await setUserSession(event, {
      user: {
        name,
        email,
      },
      
  }, {maxAge: MAX_AGE})
  return {}
})