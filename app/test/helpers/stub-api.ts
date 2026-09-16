import { vi } from 'vitest'

/**
 * Stub the HTTP client the code under test will use.
 *
 * The app fetches through `useApi()`, which hands out the instance
 * `src/plugins/auth-redirect.ts` built with `$fetch.create()`. A bare
 * `vi.stubGlobal('$fetch', mock)` would therefore leave that plugin without a
 * `create()` to call. Attaching one here keeps the real chain intact — plugin
 * creates from the stub, gets the stub back, `useApi()` resolves to exactly the
 * mock the spec asserts on — instead of mocking `useApi` away and testing an
 * indirection the app does not have.
 */
export function stubApi(mock: (...args: never[]) => unknown): void {
  vi.stubGlobal('$fetch', Object.assign(mock, { create: () => mock }))
}
