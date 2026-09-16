import type { CurrentMetrics, MetricsMonth } from '~~/server/helpers/metrics'

import { buildMonthlySeries, collectCurrentMetrics } from '~~/server/helpers/metrics'

export interface MetricsResponse {
  current: CurrentMetrics
  /** Oldest month first, twelve of them, the current one last. */
  months: MetricsMonth[]
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
  const current = await collectCurrentMetrics(config)
  return {
    current,
    // The postal-code count is already in hand, and the running month has no
    // other source for it — see `buildMonthlySeries`.
    months: await buildMonthlySeries(new Date(), current.withPostalCode),
  }
})
