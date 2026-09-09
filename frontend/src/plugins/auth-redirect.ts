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

export default defineNuxtPlugin(() => {
  const { clear } = useUserSession()

  return { provide: { api: $fetch.create({ onResponseError: createUnauthorizedHandler(clear) }) } }
})
