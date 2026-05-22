import { randomBytes } from 'node:crypto'
import path from 'node:path'

import { and, eq, isNull, or } from 'drizzle-orm'

import { useDb } from '~~/server/db'
import { users } from '~~/server/db/schema'
import { defaultParams, emailRenderer } from '~~/server/helpers/email'
import {
  collectEventsForUser,
  formatDayHeadingDE,
  formatTimeDE,
  groupEventsByDay,
  isoWeekNumber,
  nextWeekRange,
  renderNewsletterText,
} from '~~/server/helpers/newsletter'

interface SendResult {
  sent: number
  skipped: number
  errors: number
  errorEmails: string[]
}

/**
 * Audience policy:
 *   - phase 1 (opt-in):  WHERE newsletter_subscribed = 'subscribed'
 *   - phase 2 (opt-out): WHERE newsletter_subscribed IS NULL OR = 'subscribed'
 * Flip via env `NEWSLETTER_DEFAULT_OPT_IN=true`.
 */
function audienceFilter() {
  const defaultOptIn = process.env.NEWSLETTER_DEFAULT_OPT_IN === 'true'
  if (defaultOptIn) {
    return and(
      isNull(users.deletedAt),
      eq(users.loginDisabled, false),
      or(eq(users.newsletterSubscribed, 'subscribed'), isNull(users.newsletterSubscribed)),
    )
  }
  return and(
    isNull(users.deletedAt),
    eq(users.loginDisabled, false),
    eq(users.newsletterSubscribed, 'subscribed'),
  )
}

/**
 * Subject says "(KWxx)" for the *upcoming* calendar week. The cron fires on
 * Sunday 18:00 — ISO-wise that Sunday closes the running week, so we advance
 * one day to land on the following Monday and read the week number from there.
 */
function upcomingWeekLabel(from: Date): string {
  const nextDay = new Date(from.getTime() + 24 * 60 * 60 * 1000)
  return `KW${String(isoWeekNumber(nextDay)).padStart(2, '0')}`
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!config.SYNC_SECRET) {
    throw createError({ statusCode: 503, statusMessage: 'Sync not configured' })
  }
  const authHeader = getHeader(event, 'authorization') ?? ''
  if (authHeader !== `Bearer ${config.SYNC_SECRET}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const db = useDb()
  const recipients = await db
    .select({
      uid: users.uid,
      email: users.email,
      displayName: users.displayName,
      unsubscribeToken: users.unsubscribeToken,
    })
    .from(users)
    .where(audienceFilter())

  const range = nextWeekRange()
  const weekLabel = upcomingWeekLabel(range.from)
  const davConfig = {
    DAV_USERNAME: config.DAV_USERNAME,
    DAV_PASSWORD: config.DAV_PASSWORD,
    DAV_URL: config.DAV_URL,
    DAV_URL_CARD: config.DAV_URL_CARD,
  }

  const result: SendResult = { sent: 0, skipped: 0, errors: 0, errorEmails: [] }

  for (const user of recipients) {
    // Phase-2 (default-opt-in) sweeps in legacy users who never visited the
    // settings page — they have no unsubscribe token yet. Mint one on the
    // first send so the List-Unsubscribe header has something to point at.
    let unsubscribeToken = user.unsubscribeToken
    if (!unsubscribeToken) {
      unsubscribeToken = randomBytes(32).toString('hex')
      await db
        .update(users)
        .set({ unsubscribeToken })
        .where(eq(users.uid, user.uid))
    }
    try {
      const events = await collectEventsForUser(davConfig, config.CLIENT_URI, user.email, range)
      const days = groupEventsByDay(events).map((g) => ({
        heading: formatDayHeadingDE(g.date),
        events: g.events.map((ev) => ({
          ...ev,
          timeLabel: ev.allDay ? '' : formatTimeDE(ev.startDate),
        })),
      }))

      const unsubscribeUrl = `${config.CLIENT_URI.replace(/\/+$/, '')}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
      const settingsUrl = `${config.CLIENT_URI.replace(/\/+$/, '')}/settings`

      // Plain-text body is built in TS so we control the line breaks; pug's
      // `|`-based text mode was unreliable and produced run-together output.
      const text = renderNewsletterText({
        greetingName: user.displayName,
        days,
        organizationUrl: config.CLIENT_URI,
        settingsUrl,
        unsubscribeUrl,
      })

      await emailRenderer.send({
        template: path.join(process.cwd(), 'server/emails/weekly-newsletter'),
        message: {
          to: { address: user.email, name: user.displayName ?? '' },
          text,
          // RFC 8058 one-click + a clickable URL for legacy clients.
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        },
        locals: {
          ...defaultParams,
          locale: 'de',
          name: user.displayName,
          alwaysSalutation: true,
          days,
          weekLabel,
          unsubscribeUrl,
          settingsUrl,
        },
      })
      await db
        .update(users)
        .set({ newsletterLastSentAt: new Date() })
        .where(eq(users.uid, user.uid))
      result.sent += 1
    } catch (err) {
      console.error(`[newsletter] failed for ${user.email}:`, err)
      result.errors += 1
      result.errorEmails.push(user.email)
    }
  }

  return result
})
