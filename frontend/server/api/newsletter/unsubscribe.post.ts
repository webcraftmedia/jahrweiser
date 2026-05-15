import { unsubscribeByToken } from './unsubscribe'

/**
 * RFC 8058 one-click target. Mail clients POST with body
 * `List-Unsubscribe=One-Click`; we ignore the body and rely on the
 * `?token=` query string.
 */
export default defineEventHandler(async (event) => {
  const token = getQuery(event).token as string | undefined
  const ok = await unsubscribeByToken(token ?? '')
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: 'Token invalid' })
  }
  setResponseStatus(event, 200)
  return {}
})
