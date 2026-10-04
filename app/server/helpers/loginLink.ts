import { randomBytes } from 'node:crypto'
import path from 'node:path'

import { firstNameOf } from '../../shared/userName'
import { useDb } from '../db'
import { loginTokens } from '../db/schema'

import { defaultParams, emailRenderer } from './email'
import { recordEvent } from './events'
import { LOGIN_CODE_TTL_MS, codeHashOf, codeKeyOf, generateLoginCode } from './loginCode'

/**
 * How long a magic link stays redeemable.
 *
 * Not a guessing defence: the token is 32 random bytes, so even six hours of
 * uninterrupted brute force are ~2^44 attempts against a 2^256 space. Widening
 * the window buys an attacker 3.6 bits, which is nothing.
 *
 * What it does trade is the link's life as a bearer credential sitting in a
 * mailbox — a forwarded mail, a shared device, a mail archive. Six hours is the
 * span in which somebody who reads their mail in the evening can still use a
 * link requested at lunchtime, which is the case this exists for; a day would
 * start covering "somebody else opens that mailbox tomorrow".
 */
export const LOGIN_TOKEN_TTL_MS = 6 * 60 * 60 * 1000

interface LoginLinkUser {
  uid: string
  email: string
  displayName: string | null
}

// Mint a single-use login token, persist it, and email the magic link. Shared
// by the user-initiated login flow (requestLoginLink) and self-registration,
// which logs the new user in via the same email-verified link. The caller owns
// any rate-limiting and user-existence checks.
//
// `codeNonce` adds a login code to the mail, bound to the browser that holds
// the nonce — see server/helpers/loginCode.ts. Only the login form passes one;
// registration has no form to type a code into.
export async function sendLoginLink(
  config: { CLIENT_URI: string },
  user: LoginLinkUser,
  redirect?: string,
  codeNonce?: string,
): Promise<void> {
  const db = useDb()
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MS)
  const code = codeNonce ? generateLoginCode() : undefined
  await db.insert(loginTokens).values({
    token,
    userUid: user.uid,
    expiresAt,
    ...(codeNonce && code
      ? { codeKey: codeKeyOf(codeNonce), codeHash: codeHashOf(codeNonce, code) }
      : {}),
  })

  const to = { address: user.email, name: user.displayName ?? '' }
  const sendArgs = {
    template: path.join(process.cwd(), 'server/emails/requestLoginLink'),
    message: { to },
    locals: {
      ...defaultParams,
      locale: 'de',
      // Greet by first name in the salutation; the "To" header keeps the full name.
      name: firstNameOf(user.displayName),
      // Grouped 3+3 for reading it off one screen and typing it into another.
      code: code && `${code.slice(0, 3)} ${code.slice(3)}`,
      codeMinutes: LOGIN_CODE_TTL_MS / 60_000,
      authURL: (() => {
        const url = new URL(`/login/${token}`, config.CLIENT_URI)
        if (redirect) url.searchParams.set('redirect', redirect)
        return url
      })(),
    },
  }
  try {
    await emailRenderer.send(sendArgs)
  } catch {
    // Nodemailer pool connections can drop silently (SMTP server idle-timeout,
    // brief network blip). One immediate retry establishes a fresh connection
    // and is cheap enough to be worth the latency cost on the first failure.
    try {
      await emailRenderer.send(sendArgs)
      // The retry is worth recording as such: a member whose links regularly
      // need a second attempt has an SMTP problem, not a browser problem.
      await recordEvent({ type: 'auth.mail_sent', userUid: user.uid, meta: { retried: true } })
      return
    } catch {
      await recordEvent({ type: 'auth.mail_failed', userUid: user.uid })
      throw createError({ statusCode: 500, statusMessage: 'Failed to send login email' })
    }
  }
  await recordEvent({ type: 'auth.mail_sent', userUid: user.uid })
}
