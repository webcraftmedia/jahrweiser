import { defineVitestConfig } from '@nuxt/test-utils/config'
import path from 'path'

export default defineVitestConfig({
  root: path.resolve(__dirname),
  test: {
    setupFiles: ['./test/setup.ts'],
    environment: 'nuxt',
    include: ['src/**/*.spec.ts', 'server/**/*.spec.ts'],
    exclude: ['e2e/**'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      all: true,
      include: ['src/**/*.{ts,vue}', 'server/helpers/*.ts', 'server/api/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'server/emails/**'],
      thresholds: {
        100: true,
      },
      reportsDirectory: path.resolve(__dirname, '../coverage'),
    },
  },
  resolve: {
    alias: {
      '~~': path.resolve(__dirname),
      '@@': path.resolve(__dirname),
    },
  },
})
