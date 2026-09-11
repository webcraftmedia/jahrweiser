import { date, int, mysqlTable } from 'drizzle-orm/mysql-core'

// One measured snapshot per day, written by the sync run (which the cron hits
// every 10 minutes — the row for the day is simply overwritten).
//
// It exists because most of these numbers cannot be reconstructed afterwards:
// `users.newsletter_subscribed` is a state, not a history, and `updated_at`
// moves on every change, so nothing in the schema can say *when* somebody
// unsubscribed. Measuring daily is the cheapest way to have that answer next
// year. The member count is the exception — it can be derived from
// `created_at`/`deleted_at` — and is recorded anyway, so the series survives
// even if those assumptions ever stop holding.
export const metricsDaily = mysqlTable('metrics_daily', {
  // `YYYY-MM-DD` in the server's timezone. Primary key, so a re-run of the
  // sync on the same day updates rather than appends.
  day: date('day', { mode: 'string' }).primaryKey(),
  members: int('members').notNull(),
  newsletterSubscribed: int('newsletter_subscribed').notNull(),
  newsletterUnsubscribed: int('newsletter_unsubscribed').notNull(),
  telegramChannels: int('telegram_channels').notNull(),
  blaettchenIssues: int('blaettchen_issues').notNull(),
  // How many members the map can actually place. Nullable, and that is the
  // point: unlike the member count this one cannot be reconstructed at all
  // (the column was backfilled from DAV in one go, so `updated_at` says
  // nothing about when somebody entered their code), and unlike the newsletter
  // split there is not even a biased approximation to fall back on. NULL means
  // "not measured on this day" — the rows written before this metric existed
  // keep it, and the chart starts the line where the measurements start
  // instead of drawing a zero nobody counted.
  withPostalCode: int('with_postal_code'),
})

export type MetricsDay = typeof metricsDaily.$inferSelect
export type NewMetricsDay = typeof metricsDaily.$inferInsert
