/**
 * The response header that tells the client how many seconds its session still
 * holds. Set by server/middleware/session-check.ts on every authenticated
 * request, read by src/plugins/auth-redirect.ts for the installed app's
 * offline calendar (docu/pwa.md).
 */
export const SESSION_EXPIRES_HEADER = 'X-Session-Expires-In'
