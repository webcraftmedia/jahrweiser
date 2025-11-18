// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  srcDir: './src',
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
    DAV_USERNAME: null,
    DAV_PASSWORD: null,
    DAV_URL: null,
    DAV_URL_CAL: null,
    DAV_URL_CARD: null,
    // SMTP
    SMTP_HOST: 'localhost',
    SMTP_PORT: (process.env.NUXT_SMTP_PORT && parseInt(process.env.NUXT_SMTP_PORT)) || 1025,
    SMTP_IGNORE_TLS: process.env.NUXT_SMTP_IGNORE_TLS !== 'false', // default = true
    SMTP_SECURE: process.env.NUXT_SMTP_SECURE === 'true',
    SMTP_USERNAME: '',
    SMTP_PASSWORD: '',
    SMTP_MAX_CONNECTIONS:
      (process.env.NUXT_SMTP_MAX_CONNECTIONS && parseInt(process.env.NUXT_SMTP_MAX_CONNECTIONS)) ||
      5,
    SMTP_MAX_MESSAGES:
      (process.env.NUXT_SMTP_MAX_MESSAGES && parseInt(process.env.NUXT_SMTP_MAX_MESSAGES)) || 100,
    // DOMAIN
    CLIENT_URI: 'http://localhost:3000',

    // Keys within public, will be also exposed to the client-side
    public: {},
  },
})

if (
  process.env.NODE_ENV !== 'test' &&
  (!process.env.NUXT_DAV_USERNAME ||
    !process.env.NUXT_DAV_PASSWORD ||
    !process.env.NUXT_DAV_URL ||
    !process.env.NUXT_DAV_URL_CAL ||
    !process.env.NUXT_DAV_URL_CARD)
) {
  console.log(process.env)
  throw new Error('Not all required .env values are defined!')
}
