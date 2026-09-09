import { recordDailyMetrics } from '~~/server/helpers/metrics'
import { syncDavToSidecar } from '~~/server/helpers/sync'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.SYNC_SECRET) {
    throw createError({ statusCode: 503, statusMessage: 'Sync not configured' })
  }

  const authHeader = getHeader(event, 'authorization') ?? ''
  const expected = `Bearer ${config.SYNC_SECRET}`
  if (authHeader !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const result = await syncDavToSidecar({
    DAV_USERNAME: config.DAV_USERNAME,
    DAV_PASSWORD: config.DAV_PASSWORD,
    DAV_URL: config.DAV_URL,
    DAV_URL_CARD: config.DAV_URL_CARD,
  })

  // Today's measurement rides along with the sync the cron already runs, so
  // the dashboard series needs no schedule of its own. Deliberately after the
  // sync and deliberately not fatal: a broken metrics write must never make a
  // cron run look failed, and the numbers are re-measured ten minutes later.
  try {
    await recordDailyMetrics(config)
    // eslint-disable-next-line no-catch-all/no-catch-all -- Kennzahlen sind Beiwerk; ein Fehler hier darf den Sync nicht als gescheitert melden
  } catch (error) {
    console.error('Failed to record daily metrics:', error)
  }

  return result
})
