import {
  addressBookQuery,
  calendarQuery,
  DAVNamespaceShort,
  DAVResponse,
  fetchCalendarObjects,
  updateVCard,
} from 'tsdav'

import ICAL from 'ical.js'

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
  DAV_URL_CAL: string
  DAV_URL_CARD: string
}

export const headers = (config: DAV_CONFIG) => {
  return {
    authorization:
      'Basic ' +
      btoa(unescape(encodeURIComponent(config.DAV_USERNAME + ':' + config.DAV_PASSWORD))),
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

export const findEvents = (config: DAV_CONFIG, from: Date, to: Date) =>
  calendarQuery({
    url: config.DAV_URL + config.DAV_URL_CAL,
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
    headers: headers(config),
  })

export const findEvent = (config: DAV_CONFIG, id: string) =>
  fetchCalendarObjects({
    calendar: {
      url: config.DAV_URL + config.DAV_URL_CAL,
    },
    objectUrls: [`${id}.ics`],
    headers: headers(config),
  })

export const findUserByToken = async (config: DAV_CONFIG, token: string) => {
  const users = await addressBookQuery({
    url: config.DAV_URL + config.DAV_URL_CARD,
    headers: headers(config),
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

export const findUserByEmail = async (config: DAV_CONFIG, email: string) => {
  const users = await addressBookQuery({
    url: config.DAV_URL + config.DAV_URL_CARD,
    headers: headers(config),
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

export const saveUser = (config: DAV_CONFIG, user: DAVResponse, vcard: ICAL.Component) =>
  updateVCard({
    vCard: {
      url: config.DAV_URL + user.href,
      data: vcard,
      etag: user.props?.getetag,
    },
    headers: headers(config),
  })
