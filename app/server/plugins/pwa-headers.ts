import { revalidateHeader } from '../helpers/pwaHeaders'

/**
 * `Cache-Control: no-cache` for the service worker, the manifest and the
 * offline page (see server/helpers/pwaHeaders.ts for why).
 *
 * A Nitro plugin rather than `routeRules` in nuxt.config.ts: Nuxt compiles
 * every route rule into a matcher that ships in the client entry bundle —
 * bytes every desktop visitor would download for three server-only headers.
 * The `request` hook runs before the static file handler, which adds no
 * Cache-Control of its own for these files.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const value = revalidateHeader(event.path)
    if (value) setResponseHeader(event, 'cache-control', value)
  })
})
