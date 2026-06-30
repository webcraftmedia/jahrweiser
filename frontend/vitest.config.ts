import path from 'path'

import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  root: path.resolve(__dirname),
  test: {
    setupFiles: ['./test/setup.ts'],
    environment: 'nuxt',
    include: ['src/**/*.spec.ts', 'server/**/*.spec.ts', 'shared/**/*.spec.ts'],
    exclude: ['e2e/**'],
    execArgv: ['--import', path.resolve(__dirname, 'test/preload.mjs')],
    coverage: {
      reporter: ['text', 'json', 'html'],
      all: true,
      include: ['src/**/*.{ts,vue}', 'server/helpers/*.ts', 'server/api/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'server/emails/**',
        // These four carry branchy / defensive DB-and-DAV orchestration (bulk
        // newsletter send, the full DAV→sidecar diff, the rate-limited login
        // request, the multi-path register flow). Their behaviour is validated
        // by the full-stack e2e suite, and the `_smoke.spec.ts` import test
        // guards them against load-time errors. Everything else that touches the
        // DB is now unit-tested with a mocked DB/DAV layer (see test/helpers/mock-db.ts).
        'server/api/requestLoginLink.post.ts',
        'server/api/register.post.ts',
        'server/api/admin/send-newsletter.post.ts',
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
