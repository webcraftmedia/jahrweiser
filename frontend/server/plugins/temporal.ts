import { Temporal } from 'temporal-polyfill'

// Explicitly assign to globalThis so SSR rendering can access it
;(globalThis as Record<string, unknown>).Temporal = Temporal

export default defineNitroPlugin(() => {})
