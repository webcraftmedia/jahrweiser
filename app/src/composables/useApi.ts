/**
 * The app's HTTP client: `$fetch` with the 401 handling from
 * `src/plugins/auth-redirect.ts` attached.
 *
 * Every request the app makes goes through this instead of the auto-imported
 * `$fetch`. Nuxt freezes that one the moment its generated module is first
 * evaluated:
 *
 *   if (!globalThis.$fetch) { globalThis.$fetch = _$fetch.create({ baseURL }) }
 *   export const $fetch = globalThis.$fetch
 *
 * So a plugin can no longer wrap the client by replacing `globalThis.$fetch` —
 * that assignment happens after the snapshot was taken and reaches nobody. This
 * composable resolves the instance per call instead, which keeps the
 * interceptor attached regardless of when the plugin ran.
 *
 * `no-restricted-syntax` in eslint.config.ts forbids bare `$fetch` in app code,
 * so a new call site cannot quietly slip past the 401 handling.
 */
export function useApi() {
  return useNuxtApp().$api
}
