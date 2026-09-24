// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import handler from './01.probe-filter'

interface FakeEvent {
  path: string
  node: { res: { statusCode?: number } }
}

const run = handler as unknown as (event: FakeEvent) => unknown

/** The shape h3 hands a middleware, reduced to what the filter touches. */
function eventFor(path: string): FakeEvent {
  return { path, node: { res: {} } }
}

describe('probe-filter middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Taken from the production log: every one of these rendered the Nuxt error
  // page and left a multi-line vue-router warning behind.
  it.each([
    '/wp-admin/css/colors/modern/',
    '/wp-content/plugins/hellopress/wp_filemanager.php',
    '/wp-includes/wlwmanifest.xml',
    '/wp-json/wp/v2/pages?per_page=100',
    '/xmlrpc.php?rsd',
    '/cgi-bin/index.php',
    '/vendor/phpunit/phpunit/phpunit.php',
    '/@fs/app/.env?import&raw??',
    '/.env',
    '/api/.env',
    '/public../.env',
    '/.aws/credentials',
    '/.ssh/id_ed25519',
    '/.github/workflows/deploy.yml',
    '/admin.php',
    '/api/console/api_server?sense_version=1&apis=../../../../.env',
    '/userfiles/x?path=../../../../proc/self/environ',
  ])('answers 404 for %s without rendering', (path) => {
    const event = eventFor(path)
    expect(run(event)).toBe('Not Found')
    expect(event.node.res.statusCode).toBe(404)
  })

  // The other half of the job: a filter that eats a real route is worse than no
  // filter at all, so every path shape the app actually serves is checked.
  it.each([
    '/',
    '/2025/03',
    '/2025/03/event/abc-123/2',
    '/login',
    '/login/1f3c9a2b4d5e6f70',
    '/login/1f3c9a?redirect=/2025/03',
    '/register/invite-token',
    '/settings',
    '/karte',
    '/telegram',
    '/blaettchen',
    '/blaettchen/2024-01.pdf',
    '/admin/members/add',
    '/api/calendars',
    '/api/redeemLoginLink',
    '/api/register/tok-1',
    '/_nuxt/entry.B7dK2x9a.js',
    '/_nuxt/builds/meta/abc.json',
    '/favicon.ico',
    '/robots.txt',
    '/.well-known/acme-challenge/xyz',
  ])('lets %s through', (path) => {
    const event = eventFor(path)
    expect(run(event)).toBeUndefined()
    expect(event.node.res.statusCode).toBeUndefined()
  })
})
