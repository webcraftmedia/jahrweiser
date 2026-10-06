import { defineNuxtConfig } from 'nuxt/config'

import pwaIcons from './assets/pwa-icons.json'

const isTest = !!process.env.VITEST

/** Shown in the footer, and the cache-buster for the polyfill script. */
const appVersion = isTest ? '0.0.0-test' : process.env.npm_package_version || 'development'

/**
 * Emergency off switch for the service worker (docu/pwa.md): `PWA_KILL_SWITCH=true`
 * in .env and a redeploy ship a sw.js that clears its caches and unregisters
 * itself, and the app stops registering a new one.
 */
const pwaKillSwitch = process.env.PWA_KILL_SWITCH === 'true'

/** Light and dark page background — what the status bar should blend into. */
const THEME_LIGHT = '#faf5eb' // ivory
const THEME_DARK = '#1a1714' // poster-dark

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  telemetry: false,
  devtools: { enabled: true },
  srcDir: './src',
  ignore: ['**/*.spec.ts'],
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      script: [
        // Classic and not deferred, so it runs before the (always deferred)
        // module bundle — see public/polyfills.js for why that ordering is the
        // whole point. Served from our own origin: a polyfill CDN would put a
        // third party in front of every page load, and polyfill.io is the
        // textbook example of how that ends.
        { src: `/polyfills.js?v=${appVersion}` },
      ],
      // Home-screen metadata for iOS and older Android browsers. Harmless on
      // desktop — unlike `<link rel="manifest">`, which makes Chrome and Edge
      // offer an install button and is therefore only added on phones and
      // tablets (src/plugins/pwa.client.ts).
      meta: [
        { name: 'theme-color', content: THEME_LIGHT, media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: THEME_DARK, media: '(prefers-color-scheme: dark)' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Jahrweiser' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      ],
      link: [{ rel: 'apple-touch-icon', href: pwaIcons['apple-touch-icon'].src }],
    },
  },
  // Fonts are self-hosted — see the comment in fonts.css for why not Google.
  css: ['~/assets/css/fonts.css'],
  tailwindcss: {
    cssPath: '~/assets/css/jahrweiser.css',
  },
  typescript: {
    tsConfig: {
      include: ['../types/**/*.d.ts'],
    },
  },
  vite: {
    build: {
      // Keep in step with .browserslistrc — `scripts/browser-baseline.mjs`
      // fails the build if the emitted syntax drifts above this.
      //
      // Vite 8 defaults to `baseline-widely-available` (Safari 16 / Chrome 107).
      // Two dependencies ship ES2022 class fields, so without this line the
      // entry chunk is a SyntaxError on anything older — and a SyntaxError
      // happens before any of our code runs, so nothing can report it. The
      // member just sees the server-rendered markup sit there forever.
      target: ['chrome80', 'edge80', 'firefox72', 'safari14'],
    },
    optimizeDeps: {
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
        'temporal-polyfill/global',
        'zod',
        '@schedule-x/calendar',
        '@schedule-x/calendar-controls',
        '@schedule-x/events-service',
        '@schedule-x/vue',
      ],
    },
  },
  nitro: {
    typescript: {
      tsConfig: {
        include: ['../types/**/*.d.ts'],
      },
    },
    ignore: ['**/*.spec.ts'],
    externals: {
      inline: ['temporal-polyfill'],
    },
  },
  modules: [
    ...(process.env.NODE_ENV !== 'production'
      ? [
          ['@nuxt/eslint', { config: { typescript: { tsconfigPath: 'tsconfig.json' } } }],
          '@nuxt/test-utils',
        ]
      : []),
    '@nuxtjs/tailwindcss',
    '@nuxtjs/i18n',
    'nuxt-svgo',
    'nuxt-auth-utils',
    '@vite-pwa/nuxt',
  ],
  // Service worker and manifest — what is cached, what never is, and why:
  // docu/pwa.md.
  pwa: {
    registerType: 'autoUpdate',
    selfDestroying: pwaKillSwitch,
    // Registration is ours (src/plugins/pwa.client.ts): the module's plugin
    // reloads every open tab when an update activates, which would throw away
    // a half-written form for an update nobody needs to see right away.
    injectRegister: false,
    client: { registerPlugin: false },
    manifest: {
      id: '/',
      name: 'Jahrweiser',
      short_name: 'Jahrweiser',
      description: 'Der Kalender von gg-g.info',
      lang: 'de',
      dir: 'ltr',
      // The mark tells a start from the home screen apart from a visit in the
      // browser, also where the browser does not report standalone — see
      // rememberAppLaunch in src/utils/installPrompt.ts.
      start_url: '/?app',
      scope: '/',
      display: 'standalone',
      background_color: THEME_LIGHT,
      theme_color: THEME_LIGHT,
      icons: [
        { src: pwaIcons['icon-192'].src, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: pwaIcons['icon-512'].src, sizes: '512x512', type: 'image/png', purpose: 'any' },
        // The same file: the artwork is full bleed with the letters inside
        // the safe zone, so it survives every mask (scripts/pwa-icons.mjs).
        {
          src: pwaIcons['icon-512'].src,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      // The app shell: hashed bundles, fonts, icons and the offline page.
      // Never HTML and never /api — both carry personal data.
      globPatterns: ['_nuxt/**/*.{js,css}', '**/*.woff2', 'pwa/*.png', 'offline.html'],
      // Nuxt's build manifest is not hashed, and the app fetches it with a
      // cache-busting query the precache would never match anyway.
      globIgnores: ['_nuxt/builds/**'],
      // Taken as is. Without this the module installs its own transform,
      // which rewrites `offline.html` to `/offline` (meant for prerendered
      // pages) — a URL only the SSR renderer answers, with a 404.
      manifestTransforms: [(manifest) => ({ manifest, warnings: [] })],
      // Navigations are not answered from a precached document (that would
      // be stale SSR HTML) but by the runtime rule below.
      navigateFallback: null,
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
      // One file instead of sw.js + workbox-<hash>.js: one URL to keep
      // uncached, one to replace in an emergency.
      inlineWorkboxRuntime: true,
      // Page requests start while the worker is still booting, so routing
      // them through it costs no extra round trip.
      navigationPreload: true,
      runtimeCaching: [
        {
          // Calendar pages, for the installed app's offline calendar
          // (docu/pwa.md): from the network whenever it answers, from this
          // cache when it does not. The page carries the member's name in its
          // session payload, so the app deletes this cache on logout, on a
          // 401, on another member signing in and when the session ran out
          // (src/utils/offlineSession.ts). Only real 200 pages — a redirect
          // to the login must not be stored under a calendar address.
          // Self-contained: workbox-build copies the function's source into
          // sw.js, so it cannot call anything defined in this file.
          urlPattern: ({ request, url }) => {
            if (request.mode !== 'navigate') return false
            // `/`, `/2026`, `/2026/10`, `/2026/10/event/<id>[/<occurrence>]`
            const [year, month, event, id, occurrence, ...rest] = url.pathname
              .split('/')
              .filter(Boolean)
            return (
              rest.length === 0 &&
              (year === undefined || /^\d{4}$/.test(year)) &&
              (month === undefined || /^\d{1,2}$/.test(month)) &&
              (event === undefined || (event === 'event' && id !== undefined)) &&
              (occurrence === undefined || /^\d+$/.test(occurrence))
            )
          },
          handler: 'NetworkFirst',
          options: {
            cacheName: 'jahrweiser-pages',
            networkTimeoutSeconds: 5,
            expiration: { maxEntries: 12 },
            plugins: [
              {
                cacheWillUpdate: async ({ response }) =>
                  Promise.resolve(
                    response.status === 200 && !response.redirected ? response : null,
                  ),
              },
              {
                // No network and this very address was never stored — the
                // app may be started on whatever address was open last
                // (/2026/10, an event), not on its start_url. Any calendar
                // address can show the stored start page: the app reads the
                // month and the event from the address and the data from the
                // device. Only without one, the offline notice. Literals
                // only: workbox-build copies this function's source into
                // sw.js (start pages: src/utils/serviceWorker.ts).
                handlerDidError: async () => {
                  const pages = await caches.open('jahrweiser-pages')
                  return (
                    (await pages.match('/?app')) ??
                    (await pages.match('/')) ??
                    (await caches.match('/offline.html', { ignoreSearch: true })) ??
                    Response.error()
                  )
                },
              },
            ],
          },
        },
        {
          // Page loads always go to the network; only when that fails is the
          // precached offline page shown. /api (e.g. a Blättchen PDF opened
          // directly) and the address book under /admin/cal/ — another app
          // on the same origin — are left entirely to the browser.
          urlPattern: ({ request, url }) =>
            request.mode === 'navigate' &&
            !url.pathname.startsWith('/api/') &&
            !url.pathname.startsWith('/admin/cal/'),
          handler: 'NetworkOnly',
          options: { precacheFallback: { fallbackURL: '/offline.html' } },
        },
      ],
    },
    // A service worker in development serves yesterday's bundle against
    // today's code. `npm run build && npm run preview` to try it.
    devOptions: { enabled: false },
  },
  // `Cache-Control: no-cache` for sw.js, the manifest and the offline page is
  // set in server/plugins/pwa-headers.ts, not here: route rules end up in the
  // client entry bundle.
  i18n: {
    restructureDir: './',
    defaultLocale: 'de',
    differentDomains: process.env.NODE_ENV === 'production',
    locales: [{ code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' }],
    detectBrowserLanguage: false,
    /* detectBrowserLanguage: {
      // This doesn't make a difference
      useCookie: false,
      alwaysRedirect: true,
    }, */
    strategy: 'no_prefix',
    /* bundle: {
      optimizeTranslationDirective: false,
    }, */
  },
  runtimeConfig: {
    // The private keys which are only available within server-side.
    // Defaults are tuned for the local docker-compose stack so `npm run dev`
    // and the CLIs work out-of-the-box without a .env file. Production
    // deployments MUST override these (see the ready-hook below).
    // DAV
    DAV_USERNAME: process.env.DAV_USERNAME || 'admin',
    DAV_PASSWORD: process.env.DAV_PASSWORD || 'admin',
    DAV_URL: process.env.DAV_URL || 'http://localhost:8088',
    DAV_URL_CARD: process.env.DAV_URL_CARD || '',
    // Database (auth sidecar)
    DB_HOST: process.env.DB_HOST || 'localhost',
    DB_PORT: (process.env.DB_PORT && parseInt(process.env.DB_PORT)) || 3306,
    DB_USER: process.env.DB_USER || 'jahrweiser',
    DB_PASSWORD: process.env.DB_PASSWORD || 'jahrweiser',
    DB_NAME: process.env.DB_NAME || 'jahrweiser',
    // Bearer secret for POST /api/admin/sync-now (crontab trigger)
    SYNC_SECRET: process.env.SYNC_SECRET || 'dev-sync-secret',
    // Per-user cooldown (ms) for /api/requestLoginLink. Defaults to 60s in
    // production; e2e overrides to 0 so back-to-back logins for the same
    // user (different tests in the same suite) don't get rate-limited.
    LOGIN_RATE_LIMIT_MS:
      process.env.LOGIN_RATE_LIMIT_MS !== undefined
        ? parseInt(process.env.LOGIN_RATE_LIMIT_MS)
        : 60_000,
    // SMTP
    SMTP_HOST: process.env.SMTP_HOST || 'localhost',
    SMTP_PORT: (process.env.SMTP_PORT && parseInt(process.env.SMTP_PORT)) || 1025,
    SMTP_IGNORE_TLS: process.env.SMTP_IGNORE_TLS !== 'false', // default = true
    SMTP_SECURE: process.env.SMTP_SECURE === 'true',
    SMTP_USERNAME: process.env.SMTP_USERNAME || '',
    SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
    SMTP_MAX_CONNECTIONS:
      (process.env.SMTP_MAX_CONNECTIONS && parseInt(process.env.SMTP_MAX_CONNECTIONS)) || 5,
    SMTP_MAX_MESSAGES:
      (process.env.SMTP_MAX_MESSAGES && parseInt(process.env.SMTP_MAX_MESSAGES)) || 100,
    // DOMAIN
    CLIENT_URI: process.env.CLIENT_URI || 'http://localhost:3000',
    // IANA timezone used to format dates/times in server-rendered output
    // (e.g. the weekly newsletter). The Nuxt process itself runs with TZ=UTC,
    // so any human-facing formatting must explicitly opt into this zone.
    APP_TIMEZONE: process.env.APP_TIMEZONE || 'Europe/Berlin',
    // Blättchen issues (PDFs) shown on /blaettchen. Git-ignored, so the issues
    // never reach the repository. Overridable so the directory can live outside
    // the deployment directory entirely (e.g. /var/lib/jahrweiser/blaettchen)
    // and survive a redeploy — see docu/blaettchen.md.
    BLAETTCHEN_DIR: process.env.BLAETTCHEN_DIR || 'data/blaettchen',
    // Where member feedback and bug reports go. Private for the same reason as
    // the Blättchen address below: through `public` it would sit in the client
    // bundle for anyone to scrape. Empty = the feedback form is not offered.
    //
    // Outside production the default points at the maildev inbox of the
    // docker-compose stack, so `npm run dev` offers the form without a .env —
    // like every other default here. Production keeps the empty default: a
    // silent send into a nonexistent mailbox would lose real reports, so the
    // form stays off until an operator names an address.
    FEEDBACK_EMAIL:
      process.env.FEEDBACK_EMAIL ||
      (process.env.NODE_ENV === 'production' ? '' : 'feedback@example.com'),
    // Per-user cooldown (ms) between two feedback mails. Stops a double-click
    // or a frustrated member from filling the inbox; e2e overrides it to 0.
    FEEDBACK_RATE_LIMIT_MS:
      process.env.FEEDBACK_RATE_LIMIT_MS !== undefined
        ? parseInt(process.env.FEEDBACK_RATE_LIMIT_MS)
        : 60_000,
    // Where contributions for the next issue go. A private address, so it is
    // handed out through the authenticated endpoint and never through
    // `public` — the latter would put it in the client bundle, readable by any
    // anonymous visitor in the page source. Empty = no call for contributions.
    BLAETTCHEN_CONTACT_EMAIL: process.env.BLAETTCHEN_CONTACT_EMAIL || '',

    // Keys within public, will be also exposed to the client-side
    public: {
      appVersion,
      // Read by src/plugins/pwa.client.ts; see `pwaKillSwitch` above.
      serviceWorker: !pwaKillSwitch,
    },
  },
  hooks: {
    ready() {
      // Production must explicitly set DAV credentials — the dev defaults
      // point at localhost and would never work in prod anyway. In dev/test
      // the defaults from runtimeConfig kick in.
      if (
        process.env.NODE_ENV === 'production' &&
        (!process.env.DAV_USERNAME ||
          !process.env.DAV_PASSWORD ||
          !process.env.DAV_URL ||
          !process.env.SYNC_SECRET)
      ) {
        throw new Error(
          'Production requires DAV_USERNAME, DAV_PASSWORD, DAV_URL, SYNC_SECRET to be set.',
        )
      }
    },
  },
})
