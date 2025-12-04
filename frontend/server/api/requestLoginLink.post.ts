import { z } from 'zod'

import { createTransport } from 'nodemailer'
import type * as SMTPTransport from 'nodemailer/lib/smtp-pool'

import Email from 'email-templates'
import path from 'node:path'
import {
  findUserByEmail,
  saveUser,
  X_LOGIN_DISABLED,
  X_LOGIN_REQUEST_TIME,
  X_LOGIN_TOKEN,
} from '../helpers/dav'
import { MAX_AGE } from './redeemLoginLink.post'

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
  ORGANIZATION_URL: config.CLIENT_URI,
  ORGANIZATION_NAME: 'GG&G',
  welcomeImageUrl: new URL('/logo.png', config.CLIENT_URI).toString(),
  loginDays: MAX_AGE / 60 / 60 / 24,
}

const transport = createTransport(nodemailerTransportOptions)

const from = {
  name: 'Jahrweiser' /* CONFIG.EMAIL_FROM_NAME */,
  address: 'admin@gg-g.info' /*CONFIG.EMAIL_DEFAULT_SENDER*/,
}

const bodySchema = z.object({
  email: z.email(),
})

export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, bodySchema.parse)

  const config = useRuntimeConfig()

  // check if email in dav
  const query = await findUserByEmail(config, email)

  if (!query) {
    console.log('user not found')
    return {}
  }

  const { user, vcard } = query

  const now = Date.now()

  const REQUEST_TIMEOUT = 60000

  const isDisabled = vcard.getFirstPropertyValue(X_LOGIN_DISABLED) as string
  if (isDisabled === 'true') {
    console.log('account disabled')
    return {}
  }

  const lastRequest = vcard.getFirstPropertyValue(X_LOGIN_REQUEST_TIME) as string
  if (new Date(parseInt(lastRequest) + REQUEST_TIMEOUT) >= new Date(now)) {
    console.log('too many requests')
    return {}
  }

  const authtoken = crypto.randomUUID()

  vcard.updatePropertyWithValue(X_LOGIN_REQUEST_TIME, now)
  vcard.updatePropertyWithValue(X_LOGIN_TOKEN, authtoken)

  await saveUser(config, user, vcard)

  // send email with link
  const name = vcard.getFirstPropertyValue('fn')

  const emailRenderer = new Email({
    message: {
      from,
    },
    transport,
    i18n: {
      locales: ['de'],
      defaultLocale: 'de',
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
        authURL: new URL(`/login/${authtoken}`, config.CLIENT_URI),
      },
    })
  } catch (error) {
    throw new Error(error as string)
  }

  // Always return success
  return {}
})
