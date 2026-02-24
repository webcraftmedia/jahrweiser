import type { DAVAccount, DAVResponse } from 'tsdav'
import {
  addressBookQuery,
  calendarQuery,
  createVCard,
  DAVNamespaceShort,
  fetchCalendarObjects,
  fetchCalendars,
  updateVCard,
} from 'tsdav'

import ICAL from 'ical.js'
import { createHash } from 'node:crypto'
import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'

export const X_LOGIN_REQUEST_TIME = 'x-login-request-time'
export const X_LOGIN_TOKEN = 'x-login-token'
export const X_LOGIN_TIME = 'x-login-time'
export const X_LOGIN_DISABLED = 'x-login-disabled'
export const X_ROLE = 'x-role'
export const X_ADMIN_TAGS = 'x-admin-tags'

export type DAV_CONFIG = {
  DAV_USERNAME: string
  DAV_PASSWORD: string
  DAV_URL: string
  DAV_URL_CARD: string
}

export const createCalDAVAccount = (config: DAV_CONFIG): DAVAccount => ({
  accountType: 'caldav',
  serverUrl: config.DAV_URL,
  credentials: { username: config.DAV_USERNAME, password: config.DAV_PASSWORD },
  rootUrl: config.DAV_URL + '/dav.php/',
  homeUrl: config.DAV_URL + `/dav.php/calendars/${config.DAV_USERNAME}/`,
})

export const createCardDAVAccount = (config: DAV_CONFIG): DAVAccount => ({
  accountType: 'carddav',
  serverUrl: config.DAV_URL,
  credentials: { username: config.DAV_USERNAME, password: config.DAV_PASSWORD },
  rootUrl: config.DAV_URL + '/dav.php/',
  homeUrl: config.DAV_URL + `/dav.php/addressbooks/${config.DAV_USERNAME}/default/`,
})

const DAV_TIMEOUT_MS = 300000 // 30 seconds

// Create HTTP/HTTPS agents with custom timeout settings
const httpAgent = new HttpAgent({
  keepAlive: true,
  // timeout: DAV_TIMEOUT_MS,
})

const httpsAgent = new HttpsAgent({
  keepAlive: true,
  // timeout: DAV_TIMEOUT_MS,
})

const createTimeoutSignal = (timeoutMs: number) => {
  const controller = new AbortController()
  setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  return controller.signal
}

const getFetchOptions = () => ({
  signal: createTimeoutSignal(DAV_TIMEOUT_MS),
  agent: (parsedURL: URL) => (parsedURL.protocol === 'http:' ? httpAgent : httpsAgent),
})

export const headers = (account: DAVAccount) => {
  const username = account.credentials?.username ?? ''
  const password = account.credentials?.password ?? ''
  return {
    authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64'),
  }
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}T${hours}${minutes}${seconds}`
}

export const findCalendars = (account: DAVAccount) =>
  fetchCalendars({
    account,
    headers: headers(account),
  })

export const findEvents = (account: DAVAccount, url: string, from: Date, to: Date) =>
  calendarQuery({
    url,
    props: {
      [`${DAVNamespaceShort.DAV}:getetag`]: {},
      [`${DAVNamespaceShort.CALDAV}:calendar-data`]: {},
    },
    filters: {
      ['comp-filter']: {
        _attributes: {
          name: 'VCALENDAR',
        },
        ['comp-filter']: {
          _attributes: {
            name: 'VEVENT',
          },
          ['time-range']: {
            _attributes: {
              start: formatDate(from),
              end: formatDate(to),
            },
          },
        },
      },
    },
    depth: '1',
    headers: headers(account),
    fetchOptions: getFetchOptions(),
  })

export const findEvent = (account: DAVAccount, url: string, id: string) =>
  fetchCalendarObjects({
    calendar: {
      url,
    },
    objectUrls: [`${id}.ics`],
    headers: headers(account),
    fetchOptions: getFetchOptions(),
  })

export const findUserByToken = async (account: DAVAccount, token: string) => {
  const users = await addressBookQuery({
    url: account.homeUrl!,
    headers: headers(account),
    props: {
      [`${DAVNamespaceShort.DAV}:getetag`]: {},
      [`${DAVNamespaceShort.CARDDAV}:address-data`]: {},
    },
    depth: '1',
    filters: {
      ['prop-filter']: {
        _attributes: {
          name: X_LOGIN_TOKEN,
        },
        ['text-match']: token,
      },
    },
    fetchOptions: getFetchOptions(),
  })

  // TODO: This also applies if more then 1 users are found - potential flaw
  if (users.length !== 1) {
    return false
  }

  return {
    user: users[0]!,
    vcard: new ICAL.Component(ICAL.parse(users[0]!.props?.addressData)),
  }
}

export const findUserByEmail = async (account: DAVAccount, email: string) => {
  const users = await addressBookQuery({
    url: account.homeUrl!,
    headers: headers(account),
    props: {
      [`${DAVNamespaceShort.DAV}:getetag`]: {},
      [`${DAVNamespaceShort.CARDDAV}:address-data`]: {},
    },
    depth: '1',
    filters: {
      ['prop-filter']: {
        _attributes: {
          name: 'EMAIL',
        },
        ['text-match']: email,
      },
    },
    fetchOptions: getFetchOptions(),
  })

  // TODO: This also applies if more then 1 users are found - potential flaw
  if (users.length !== 1) {
    return false
  }

  return {
    user: users[0]!,
    vcard: new ICAL.Component(ICAL.parse(users[0]!.props?.addressData)),
  }
}

export const saveUser = (account: DAVAccount, user: DAVResponse, vcard: ICAL.Component) =>
  updateVCard({
    vCard: {
      url: account.serverUrl + user.href!,
      data: vcard,
      etag: user.props?.getetag,
    },
    headers: headers(account),
    fetchOptions: getFetchOptions(),
  })

export const createUser = async (account: DAVAccount, vcard: ICAL.Component) =>
  createVCard({
    addressBook: {
      url: account.homeUrl!,
    },
    filename:
      createHash('sha256')
        .update(vcard.toString() + String(new Date().getTime()))
        .digest('hex') + '.vcf',
    vCardString: vcard.toString(),
    headers: headers(account),
    fetchOptions: getFetchOptions(),
  })
