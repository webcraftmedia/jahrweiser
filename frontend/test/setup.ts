import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { expect, vi } from 'vitest'
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

// Mock für $t und andere i18n-Funktionen
config.global.mocks = {
  $t: (key: string) => key,
  // $tc: (key: string) => key,
  // $te: (key: string) => true,
  // $d: (value: any) => value,
  // $n: (value: any) => value,
}
