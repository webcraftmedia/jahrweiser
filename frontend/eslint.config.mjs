// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import { security, comments, json, yaml, vitest, css } from 'eslint-config-it4c'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'

export default withNuxt(
  // it4c-Module (self-contained, kein Nuxt-Overlap)
  ...security,
  ...comments,
  ...json,
  ...yaml,
  ...vitest,
  {
    files: ['**/*.spec.ts', '**/*.spec.js', '**/*.test.ts', '**/*.test.js'],
    settings: { vitest: { typecheck: false } },
  },
  ...css,

  // vue-i18n
  ...vueI18n.configs.recommended,
  {
    ignores: ['**/*.css'],
    rules: {
      // Best Practices
      '@intlify/vue-i18n/key-format-style': 'error',
      '@intlify/vue-i18n/no-duplicate-keys-in-locale': 'error',
      '@intlify/vue-i18n/no-dynamic-keys': 'error',
      '@intlify/vue-i18n/no-missing-keys-in-other-locales': 'error', // seems not to work
      '@intlify/vue-i18n/no-unknown-locale': 'error',
      '@intlify/vue-i18n/no-unused-keys': [
        'error',
        {
          extensions: ['.ts', '.vue'],
        },
      ],
      '@intlify/vue-i18n/prefer-sfc-lang-attr': 'error',
      // Stylistic Issues
      '@intlify/vue-i18n/prefer-linked-key-with-paren': 'error',
      '@intlify/vue-i18n/sfc-locale-attr': 'error',
    },
    settings: {
      'vue-i18n': {
        localeDir: './locales/*.{json}', // extension is glob formatting!
        // Specify the version of `vue-i18n` you are using.
        // If not specified, the message will be parsed twice.
        messageSyntaxVersion: '^11.0.0',
      },
    },
  },

  // Prettier (MUSS letztes sein)
  eslintPluginPrettierRecommended,
)
  // CSS files use a different language plugin — exclude them from JS/Vue-focused configs
  .override('nuxt/javascript', { ignores: ['**/*.css'] })
  .override('@intlify/vue-i18n:recommended:setup', { ignores: ['**/*.css'] })
  .override('@intlify/vue-i18n:recommended:rules', { ignores: ['**/*.css'] })
