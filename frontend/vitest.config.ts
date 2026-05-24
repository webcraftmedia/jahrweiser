import path from 'path'

import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  root: path.resolve(__dirname),
  test: {
    setupFiles: ['./test/setup.ts'],
    environment: 'nuxt',
    include: ['src/**/*.spec.ts', 'server/**/*.spec.ts'],
    exclude: ['e2e/**'],
    execArgv: ['--import', path.resolve(__dirname, 'test/preload.mjs')],
    coverage: {
      reporter: ['text', 'json', 'html'],
      all: true,
      include: ['src/**/*.{ts,vue}', 'server/helpers/*.ts', 'server/api/**/*.ts'],
      // The auth/sync endpoints and the DB-orchestration parts of the sync helper
      // require a live MariaDB and are validated by the e2e suite instead.
      exclude: [
        'src/**/*.spec.ts',
        'server/emails/**',
        'server/api/requestLoginLink.post.ts',
        'server/api/redeemLoginLink.post.ts',
        'server/api/admin/sync-now.post.ts',
        'server/api/admin/send-newsletter.post.ts',
        'server/api/me/newsletter.get.ts',
        'server/api/me/newsletter.post.ts',
        'server/api/newsletter/unsubscribe.ts',
        'server/api/newsletter/unsubscribe.get.ts',
        'server/api/newsletter/unsubscribe.post.ts',
        'server/helpers/sync.ts',
      ],
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
