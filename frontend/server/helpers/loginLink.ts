import { randomBytes } from 'node:crypto'
import path from 'node:path'

import { firstNameOf } from '../../shared/userName'
import { useDb } from '../db'
import { loginTokens } from '../db/schema'

import { defaultParams, emailRenderer } from './email'

export const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000

interface LoginLinkUser {
  uid: string
  email: string
  displayName: string | null
}

// Mint a single-use login token, persist it, and email the magic link. Shared
// by the user-initiated login flow (requestLoginLink) and self-registration,
// which logs the new user in via the same email-verified link. The caller owns
// any rate-limiting and user-existence checks.
export async function sendLoginLink(
  config: { CLIENT_URI: string },
  user: LoginLinkUser,
  redirect?: string,
): Promise<void> {
  const db = useDb()
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MS)
  await db.insert(loginTokens).values({ token, userUid: user.uid, expiresAt })

  const to = { address: user.email, name: user.displayName ?? '' }
  const sendArgs = {
    template: path.join(process.cwd(), 'server/emails/requestLoginLink'),
    message: { to },
    locals: {
      ...defaultParams,
      locale: 'de',
      // Greet by first name in the salutation; the "To" header keeps the full name.
      name: firstNameOf(user.displayName),
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
    } catch {
      throw createError({ statusCode: 500, statusMessage: 'Failed to send login email' })
    }
  }
}
