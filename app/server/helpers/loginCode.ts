import { createHash, randomBytes, randomInt } from 'node:crypto'

/**
 * The login code: six digits in the login mail, next to the link, for every
 * case in which the link cannot carry the login to where the member wants it.
 * On iOS a home-screen app keeps its own cookies apart from Safari, and mail
 * apps open links in a built-in browser with yet another cookie jar — the link
 * logs in *that* browser, and the member is still logged out where they
 * started. Typing the code into the form they came from cannot miss.
 *
 * Six digits are guessable where 32 random bytes are not, so the code is only
 * worth anything together with three limits:
 *
 * - It only works in the browser that asked for it. Requesting a login sets an
 *   httpOnly cookie with a random nonce; the code is checked against that
 *   nonce. Somebody who reads the mail elsewhere (or a mail scanner, which
 *   would otherwise spend it) holds a code they cannot use.
 * - It lives for minutes, not hours: the time it takes to switch to the mail
 *   app and back.
 * - It allows few wrong guesses, per code and per member and day. The binding
 *   alone does not stop an attacker who requests a code for somebody else's
 *   address — they get a cookie bound to the code in the *victim's* mail and
 *   may guess. With 5 guesses per code and 10 per day that is 1 in 100 000 per
 *   day, and every attempt puts a login mail into the victim's inbox.
 */

export const LOGIN_CODE_LENGTH = 6
export const LOGIN_CODE_TTL_MS = 15 * 60 * 1000
export const LOGIN_CODE_MAX_ATTEMPTS = 5
export const LOGIN_CODE_MAX_DAILY_FAILURES = 10

/**
 * Scoped to the one endpoint that reads it, so it never rides along on any
 * other request.
 */
export const LOGIN_CODE_COOKIE = 'jahrweiser-login-code'
const COOKIE_PATH = '/api/redeemLoginCode'

/** The request, typed without importing h3 (see server/helpers/events.ts). */
type RequestEvent = Parameters<typeof getCookie>[0]

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** What the row stores to find the code again from the cookie alone. */
export function codeKeyOf(nonce: string): string {
  return sha256(nonce)
}

/**
 * Salted with the nonce rather than stored plain: a million codes are hashed in
 * a blink, so an unsalted hash would be no better than the code itself to
 * whoever reads the table. The nonce is in no table, only in the cookie.
 */
export function codeHashOf(nonce: string, code: string): string {
  return sha256(`${nonce}:${code}`)
}

export function generateLoginCode(): string {
  return randomInt(0, 10 ** LOGIN_CODE_LENGTH)
    .toString()
    .padStart(LOGIN_CODE_LENGTH, '0')
}

/**
 * Bind the next login code to this browser and return the nonce.
 *
 * Called for every address that passes the cooldown, known or not: a cookie
 * that only arrived for known addresses would answer the question the rest of
 * the endpoint is careful not to.
 */
export function bindLoginCode(event: RequestEvent, config: { CLIENT_URI: string }): string {
  const nonce = randomBytes(32).toString('hex')
  setCookie(event, LOGIN_CODE_COOKIE, nonce, {
    httpOnly: true,
    // Secure wherever the app is served over https; not on the plain-http dev
    // stack, where some browsers would not send a Secure cookie back.
    secure: config.CLIENT_URI.startsWith('https:'),
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge: LOGIN_CODE_TTL_MS / 1000,
  })
  return nonce
}

export function readLoginCodeNonce(event: RequestEvent): string | undefined {
  return getCookie(event, LOGIN_CODE_COOKIE) || undefined
}

export function clearLoginCodeBinding(event: RequestEvent): void {
  deleteCookie(event, LOGIN_CODE_COOKIE, { path: COOKIE_PATH })
}
