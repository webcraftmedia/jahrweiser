import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    environment: 'nuxt',
    coverage: {
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 92,
      },
      reportsDirectory: '../coverage',
    },
  },
})
