import { defineVitestConfig } from '@nuxt/test-utils/config'

process.env.NUXT_DAV_USERNAME = 'user'
process.env.NUXT_DAV_PASSWORD = 'password'
process.env.NUXT_DAV_URL = 'http://localhost:999'
process.env.NUXT_DAV_URL_CAL = '/cal'
process.env.NUXT_DAV_URL_CARD = '/card'

export default defineVitestConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    environment: 'nuxt',
    coverage: {
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 90,
      },
      reportsDirectory: '../coverage',
    },
  },
})
