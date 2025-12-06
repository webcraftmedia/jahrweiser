import Email from 'email-templates'
import { createTransport } from 'nodemailer'
import type * as SMTPTransport from 'nodemailer/lib/smtp-pool'
import path from 'path'
import { MAX_AGE } from '../api/redeemLoginLink.post'

const from = {
  name: 'Jahrweiser' /* CONFIG.EMAIL_FROM_NAME */,
  address: 'admin@gg-g.info' /*CONFIG.EMAIL_DEFAULT_SENDER*/,
}

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

const transport = createTransport(nodemailerTransportOptions)

export const emailRenderer = new Email({
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

export const defaultParams = {
  APPLICATION_NAME: 'Jahrweiser',
  SUPPORT_EMAIL: 'hilfe@gg-g.info',
  ORGANIZATION_URL: config.CLIENT_URI,
  ORGANIZATION_NAME: 'GG&G',
  welcomeImageUrl: new URL('/logo.png', config.CLIENT_URI).toString(),
  loginDays: MAX_AGE / 60 / 60 / 24,
}
