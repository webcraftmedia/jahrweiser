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

  // The sync's failure is held, not thrown, so that the measurement below
  // still runs. It rides along with the cron the sync already has and needs no
  // schedule of its own — but it must not need a healthy DAV either: a sync
  // that threw for five days took the whole metrics series down with it, and
  // the numbers it measures (member count, newsletter split) come from the
  // sidecar, which is perfectly readable while DAV is unreachable.
  let syncError: unknown = null
  let result: Awaited<ReturnType<typeof syncDavToSidecar>> | null = null
  try {
    result = await syncDavToSidecar({
      DAV_USERNAME: config.DAV_USERNAME,
      DAV_PASSWORD: config.DAV_PASSWORD,
      DAV_URL: config.DAV_URL,
      DAV_URL_CARD: config.DAV_URL_CARD,
    })
    // eslint-disable-next-line no-catch-all/no-catch-all -- der Fehler wird unveraendert weitergeworfen, nur spaeter
  } catch (error) {
    syncError = error
  }

  // Not fatal in the other direction either: a broken metrics write must never
  // make a cron run look failed, and the numbers are re-measured ten minutes
  // later.
  try {
    await recordDailyMetrics(config)
    // eslint-disable-next-line no-catch-all/no-catch-all -- Kennzahlen sind Beiwerk; ein Fehler hier darf den Sync nicht als gescheitert melden
  } catch (error) {
    console.error('Failed to record daily metrics:', error)
  }

  // The cron still sees a failed sync as a failed sync. `syncDavToSidecar`
  // either returns or throws, so a null result is that throw and nothing else.
  if (result === null) throw syncError

  return result
})
