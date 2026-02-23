import { defineVitestConfig } from '@nuxt/test-utils/config'
import path from 'path'

export default defineVitestConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    environment: 'nuxt',
    environmentMatchGlobs: [['server/**/*.spec.ts', 'node']],
    include: ['src/**/*.spec.ts', 'server/**/*.spec.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['**/server/emails/**'],
      thresholds: {
        100: true,
      },
      reportsDirectory: '../coverage',
    },
  },
  resolve: {
    alias: {
      '~~': path.resolve(__dirname),
      '@@': path.resolve(__dirname),
    },
  },
})
