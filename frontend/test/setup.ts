// localStorage is patched in test/preload.ts (runs before module evaluation)
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { expect, vi } from 'vitest'
import { config } from '@vue/test-utils'

// Fail tests on Vue warnings and errors via Vue's built-in handlers
config.global.config ??= {}
config.global.config.warnHandler = (msg, _instance, trace) => {
  throw new Error(`[Vue warn]: ${msg}\n${trace}`)
}
config.global.config.errorHandler = (err) => {
  throw err instanceof Error ? err : new Error(String(err))
}

// Fail tests on [nuxt] console errors (Nuxt catches initialization errors internally
// and logs them via console.error — there is no higher-level hook to intercept these,
// as app:error hooks can only catch errors from plugins loaded after the hook is registered)
const _consoleError = console.error
console.error = (...args: unknown[]) => {
  _consoleError(...args)
  if (args.some((arg) => typeof arg === 'string' && /\[nuxt\]/.test(arg))) {
    throw new Error(`Nuxt error: ${args.map(String).join(' ')}`)
  }
}

mockNuxtImport('useUserSession', () => () => ({
  ready: computed(() => true),
  loggedIn: computed(() => false),
  user: computed(() => null),
  session: ref(null),
  fetch: vi.fn(),
  openInPopup: vi.fn(),
  clear: vi.fn(),
}))

mockNuxtImport('useI18n', () => () => {
  return {
    ...useNuxtApp().$i18n,
    locale: 'de',
    t: (key: string) => key,
  }
})

expect.addSnapshotSerializer({
  test: (val) => typeof val === 'string' && val.includes('/@fs'),
  print: (val) => '"' + (val as string).replaceAll(/\/@fs(.*)\/frontend\//g, '') + '"',
})

// Normalize SVG filter IDs to prevent snapshot mismatches across different environments
expect.addSnapshotSerializer({
  test: (val) => typeof val === 'string' && /id="i\d+__/.test(val),
  print: (val) => {
    const normalized = (val as string)
      .replaceAll(/id="i\d+__([a-z])"/g, 'id="filter-id-$1"')
      .replaceAll(/url\(#i\d+__([a-z])\)/g, 'url(#filter-id-$1)')
    return '"' + normalized + '"'
  },
})

// Mock für $t und andere i18n-Funktionen
config.global.mocks = {
  $t: (key: string) => key,
  // $tc: (key: string) => key,
  // $te: (key: string) => true,
  // $d: (value: any) => value,
  // $n: (value: any) => value,
}
