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

  return result
})
