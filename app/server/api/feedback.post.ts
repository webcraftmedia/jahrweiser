import path from 'node:path'

import { z } from 'zod'

import { FEEDBACK_FIELD_MAX, FEEDBACK_MESSAGE_MAX } from '../../shared/feedback'
import { defaultParams, emailRenderer } from '../helpers/email'

const contextSchema = z.object({
  page: z.string().max(FEEDBACK_FIELD_MAX),
  appVersion: z.string().max(FEEDBACK_FIELD_MAX),
  userAgent: z.string().max(FEEDBACK_FIELD_MAX),
  viewport: z.string().max(FEEDBACK_FIELD_MAX),
  colorScheme: z.string().max(FEEDBACK_FIELD_MAX),
})

const message = z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX)

/**
 * A union rather than one shape with an optional context, so the rule is the
 * schema: a bug report carries the technical context, plain feedback carries
 * none. zod drops unknown keys, so a context posted with `kind: 'feedback'` is
 * discarded here and never reaches the mail.
 */
const bodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('feedback'), message }),
  z.object({ kind: z.literal('bug'), message, context: contextSchema }),
])

/**
 * When each member last got a mail out of here. Per-process and unpersisted,
 * exactly like the login cooldown next door: the window is a minute, so a
 * restart costs at most one extra mail, and no schema has to know about it.
 */
const lastSentAt = new Map<string, number>()

/** Strips what would otherwise let a value forge a mail header. */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const user = session.user as { uid?: string; name?: string; email?: string; role?: string }
  if (!user.uid || !user.email) {
    throw createError({ statusCode: 401, statusMessage: 'No user context' })
  }

  const config = useRuntimeConfig()
  if (!config.FEEDBACK_EMAIL) {
    throw createError({ statusCode: 503, statusMessage: 'Feedback is not configured' })
  }

  const report = await readValidatedBody(event, bodySchema.parse)

  const previous = lastSentAt.get(user.uid)
  if (
    config.FEEDBACK_RATE_LIMIT_MS > 0 &&
    previous !== undefined &&
    Date.now() - previous < config.FEEDBACK_RATE_LIMIT_MS
  ) {
    throw createError({ statusCode: 429, statusMessage: 'Please wait before sending again' })
  }

  const senderName = singleLine(user.name ?? '')

  const sendArgs = {
    template: path.join(process.cwd(), 'server/emails/feedback'),
    message: {
      to: { address: config.FEEDBACK_EMAIL, name: '' },
      // The mail comes from the application's own sender — a member's address
      // in `From` would fail SPF/DKIM for their domain and land in spam.
      // Answering still goes straight back to them.
      replyTo: { address: user.email, name: senderName },
    },
    locals: {
      ...defaultParams,
      locale: 'de',
      // Goes to the team inbox, not to a member: no name to greet, and the
      // "ask support if you have questions" block below would be circular.
      name: '',
      alwaysSalutation: true,
      SUPPORT_EMAIL: '',
      isBug: report.kind === 'bug',
      message: report.message,
      senderName,
      senderEmail: user.email,
      senderUid: user.uid,
      senderRole: user.role ?? '',
      sentAt: new Date().toLocaleString('de-DE', { timeZone: config.APP_TIMEZONE }),
      // Present for a bug report only — see the schema above.
      ...(report.kind === 'bug' ? report.context : {}),
    },
  }

  try {
    await emailRenderer.send(sendArgs)
  } catch {
    // Same one-shot retry as the login mail: a pooled SMTP connection can drop
    // silently, and asking the member to type their report again is the worst
    // possible answer to it.
    try {
      await emailRenderer.send(sendArgs)
    } catch {
      throw createError({ statusCode: 500, statusMessage: 'Failed to send feedback email' })
    }
  }

  // Started only once a mail actually went out: a failed send must not lock the
  // member out of retrying for a minute.
  lastSentAt.set(user.uid, Date.now())

  return { sent: true }
})
