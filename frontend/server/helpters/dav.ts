import {
  addressBookQuery,
  calendarQuery,
  DAVNamespaceShort,
  fetchCalendarObjects,
  updateVCard,
} from 'tsdav'

export const X_LOGIN_REQUEST_TIME = 'x-login-request-time'
export const X_LOGIN_TOKEN = 'x-login-token'
export const X_LOGIN_TIME = 'x-login-time'

const config = useRuntimeConfig()

export const headers = {
  authorization:
    'Basic ' + btoa(unescape(encodeURIComponent(config.DAV_USERNAME + ':' + config.DAV_PASSWORD))),
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

export const findEvents = (from: Date, to: Date) =>
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
    headers,
  })

export const findEvent = (id: string) =>
  fetchCalendarObjects({
    calendar: {
      url: config.DAV_URL + config.DAV_URL_CAL,
    },
    objectUrls: [`${id}.ics`],
    headers,
  })

export const findUserByToken = (token: string) =>
  addressBookQuery({
    url: config.DAV_URL + config.DAV_URL_CARD,
    headers,
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

export const findUserByEmail = (email: string) =>
  addressBookQuery({
    url: config.DAV_URL + config.DAV_URL_CARD,
    headers,
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

export const saveUser = (href: string, etag: string, vcard: string) =>
  updateVCard({
    vCard: {
      url: config.DAV_URL + href,
      data: vcard,
      etag: etag,
    },
    headers,
  })
