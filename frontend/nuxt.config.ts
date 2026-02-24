import { defineNuxtConfig } from 'nuxt/config'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  srcDir: './src',
  typescript: {
    tsConfig: {
      include: ['../types/**/*.d.ts'],
    },
  },
  nitro: {
    typescript: {
      tsConfig: {
        include: ['../types/**/*.d.ts'],
      },
    },
  },
  modules: [
    '@nuxt/eslint',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxt/test-utils',
    '@nuxtjs/tailwindcss',
    '@nuxtjs/i18n',
    'nuxt-svgo',
    'nuxt-auth-utils',
  ],
  i18n: {
    restructureDir: './',
    defaultLocale: 'de',
    differentDomains: process.env.NODE_ENV === 'production',
    locales: [{ code: 'de', name: 'Deutsch', file: 'de.json' }],
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
    // The private keys which are only available within server-side
    // DAV
    DAV_USERNAME: process.env.DAV_USERNAME,
    DAV_PASSWORD: process.env.DAV_PASSWORD,
    DAV_URL: process.env.DAV_URL,
    DAV_URL_CARD: process.env.DAV_URL_CARD,
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

    // Keys within public, will be also exposed to the client-side
    public: {},
  },
  hooks: {
    ready() {
      if (
        process.env.NODE_ENV !== 'test' &&
        (!process.env.DAV_USERNAME || !process.env.DAV_PASSWORD || !process.env.DAV_URL)
      ) {
        throw new Error('Not all required .env values are defined!')
      }
    },
  },
})
