import { purgeOfflineData, recordSessionExpiry } from '../utils/offlineSession'

import type { Ref } from 'vue'

import { SESSION_EXPIRES_HEADER } from '~~/shared/session'

/**
 * Provides the app's HTTP client and turns a 401 into a clean logout.
 *
 * The client is handed out through `useApi()` rather than installed over
 * `globalThis.$fetch`: the auto-imported `$fetch` is a snapshot taken when its
 * module is first evaluated, so anything assigned afterwards is simply not what
 * the app calls. See src/composables/useApi.ts for the full reasoning.
 */

/**
 * Builds the 401 handler. `clear` is passed in rather than looked up inside,
 * because the handler runs from a fetch callback where the Nuxt instance is no
 * longer the active one — `useUserSession()` has to be called while the plugin
 * is still in scope.
 *
 * Exported so the spec can drive the decision itself. Whether the handler is
 * really attached to the client the app calls is a different question, and one
 * only a browser can answer — see e2e/auth-redirect.spec.ts.
 */
export function createUnauthorizedHandler(clear: () => Promise<void>) {
  return async ({
    request,
    response,
  }: {
    request: string | URL | Request
    response: { status: number }
  }) => {
    const url =
      typeof request === 'string'
        ? request
        : request instanceof URL
          ? request.pathname
          : request.url
    if (response.status === 401 && !url.includes('/api/redeemLoginLink')) {
      // The installed app's offline copy belongs to a session that is over.
      await purgeOfflineData()
      await clear()
      const currentPath =
        import.meta.client &&
        window.location.pathname !== '/' &&
        !window.location.pathname.startsWith('/login')
          ? window.location.pathname
          : undefined
      await navigateTo({
        path: '/login',
        query: currentPath ? { redirect: currentPath } : undefined,
      })
    }
  }
}

/**
 * Builds the handler that keeps the installed app's offline deadline current
 * from the header every authenticated response carries (shared/session.ts).
 * The session's `user` is passed in for the same reason `clear` is above.
 */
export function createSessionExpiryHandler(user: Ref<unknown>) {
  return async ({ response }: { response: { headers: Headers } }) => {
    const uid = (user.value as { uid?: string } | null)?.uid
    await recordSessionExpiry(uid, response.headers.get(SESSION_EXPIRES_HEADER))
  }
}

export default defineNuxtPlugin(() => {
  const { clear, user } = useUserSession()

  return {
    provide: {
      api: $fetch.create({
        onResponse: createSessionExpiryHandler(user),
        onResponseError: createUnauthorizedHandler(clear),
      }),
    },
  }
})
