import { z } from 'zod'
import { addressBookQuery, DAVNamespaceShort, updateVCard } from 'tsdav';
import ICAL from 'ical.js'

import { createTransport } from 'nodemailer'
import type * as SMTPTransport from 'nodemailer/lib/smtp-pool'

import Email from 'email-templates'
import path from 'node:path'

const config = useRuntimeConfig()

const nodemailerTransportOptions: SMTPTransport.Options = {
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  ignoreTLS: config.SMTP_IGNORE_TLS,
  secure: config.SMTP_SECURE, // true for 465, false for other ports
  pool: true,
  maxConnections: config.SMTP_MAX_CONNECTIONS,
  maxMessages: config.SMTP_MAX_MESSAGES,
  tls: {
    rejectUnauthorized: false,
  },
}
if (config.SMTP_USERNAME && config.SMTP_PASSWORD) {
  nodemailerTransportOptions.auth = {
    user: config.SMTP_USERNAME,
    pass: config.SMTP_PASSWORD,
  }
}

const defaultParams = {
  APPLICATION_NAME: 'Jahrweiser',
  SUPPORT_EMAIL: 'hilfe@gg-g.info',
  ORGANIZATION_URL: 'https://gg-g.info',
  ORGANIZATION_NAME: 'GG&G'
 }

const transport = createTransport(nodemailerTransportOptions)

const from = { name: 'Jahrweiser'/* CONFIG.EMAIL_FROM_NAME */, address: 'admin@gg-g.info' /*CONFIG.EMAIL_DEFAULT_SENDER*/ }


const bodySchema = z.object({
  email: z.email(),
})

export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, bodySchema.parse)

  const config = useRuntimeConfig()

  // check if email in dav
  const addressbooks = await addressBookQuery({
    url: config.DAV_URL + config.DAV_URL_CARD,
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
        name: 'EMAIL'
      },
      'text-match': email
    }
    }
  });

  if(addressbooks.length !== 1){
    console.log('user not found')
    return {}
  }

  // TODO this can fail due to auth error
  // console.log(addressbooks)

  const vcard = new ICAL.Component(ICAL.parse(addressbooks[0].props?.addressData));

  const X_LOGIN_REQUEST_TIME = 'x-login-request-time'
  const X_LOGIN_TOKEN = 'x-login-token'

  const now = Date.now()

  const REQUEST_TIMEOUT = 0 // 60000

  const lastRequest = vcard.getFirstPropertyValue(X_LOGIN_REQUEST_TIME) as string
  if(new Date(parseInt(lastRequest)+REQUEST_TIMEOUT) >= new Date(now)){
    console.log('too many requests')
    return {}
  }

  const authtoken = crypto.randomUUID()

  vcard.updatePropertyWithValue(X_LOGIN_REQUEST_TIME, now)
  vcard.updatePropertyWithValue(X_LOGIN_TOKEN, authtoken)

  const href = addressbooks[0].href as string
  const etag = addressbooks[0].props?.getetag

  await updateVCard({
    vCard: {
      url: config.DAV_URL + href,
      data: vcard.toString(),
      etag: etag
    },
    headers: {
      authorization: 'Basic '+btoa(unescape(encodeURIComponent(config.DAV_USERNAME + ':' + config.DAV_PASSWORD))),
    }
  })
  
  // send email with link
  const name = vcard.getFirstPropertyValue('fn')

  const emailRenderer = new Email({
    message: {
      from,
    },
    transport,
    i18n: {
      locales: ['de'],
      defaultLocale: 'de', // CONFIG.LANGUAGE_DEFAULT,
      retryInDefaultLocale: false,
      directory: path.join(process.cwd(), 'server/emails/_locales'),
      updateFiles: false,
      objectNotation: true,
      mustacheConfig: {
        tags: ['{', '}'],
        disable: false,
      },
    },
    send: true,
    preview: false,
    // This is very useful to see the emails sent by the unit tests
    /*
    preview: {
      open: {
        app: 'brave-browser',
      },
    },
    */
  })


  const to = { address: email.toString(), name: name?.toString() ?? '' }
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
        authURL: new URL(`/login/${authtoken}`, 'http://localhost:3000'/*CONFIG.CLIENT_URI*/),
      },
    })
  } catch (error) {
    throw new Error(error as string)
  }

  // Always return success
  return {}
})