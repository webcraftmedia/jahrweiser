// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'

export default withNuxt(
  // Your custom configs here
  ...vueI18n.configs.recommended,
  {
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
  eslintPluginPrettierRecommended,
)
