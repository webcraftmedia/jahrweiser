import type { CurrentMetrics, MetricsMonth } from '~~/server/helpers/metrics'
import type { ActivityCounts } from '~~/shared/activity'

import {
  buildMonthlySeries,
  collectActivity,
  collectCurrentMetrics,
} from '~~/server/helpers/metrics'
import { activeCounts } from '~~/shared/activity'

export interface MetricsResponse {
  current: CurrentMetrics
  /** Oldest month first, twelve of them, the current one last. */
  months: MetricsMonth[]
  /** Current members by how long ago they were last active — counts only. */
  activity: ActivityCounts
}

/**
 * The numbers behind /admin. Admin-only: membership figures and how many
 * people opted out of the newsletter are nobody else's business.
 */
export default defineEventHandler(async (event): Promise<MetricsResponse> => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const config = useRuntimeConfig()
  const now = new Date()
  const current = await collectCurrentMetrics(config)
  const activity = await collectActivity(now)
  return {
    current,
    // The postal-code and activity counts are already in hand, and the running
    // month has no other source for them — see `buildMonthlySeries`.
    months: await buildMonthlySeries(now, current.withPostalCode, activeCounts(activity).active30d),
    activity,
  }
})
