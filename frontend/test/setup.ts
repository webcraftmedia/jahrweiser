import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { expect } from 'vitest'
import { config } from '@vue/test-utils'

mockNuxtImport('useI18n', () => () => {
  return {
    ...useNuxtApp().$i18n,
    locale: 'de',
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
