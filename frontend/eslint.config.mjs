// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
// TODO: `node` und `promise` Module aus eslint-config-it4c sind nicht self-contained —
// sie registrieren ihr Plugin nicht selbst (eslint-plugin-n / eslint-plugin-promise).
// Bug in eslint-config-it4c melden, dann hier einbinden.
import { security, comments, json, yaml, vitest, css, prettier } from 'eslint-config-it4c'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'

export default withNuxt(
  { ignores: ['.nuxt.old/', '.claude/'] },
  // it4c-Module (self-contained, kein Nuxt-Overlap)
  ...security,
  {
    files: ['cli/**'],
    rules: {
      // CLI-Tools nutzen legitimerweise dynamische Dateipfade
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  {
    rules: {
      // Zu viele False Positives bei normalem Array/Object-Zugriff
      'security/detect-object-injection': 'off',
    },
  },
  ...comments,
  ...json,
  ...yaml,
  ...vitest,
  {
    files: ['**/*.spec.ts', '**/*.spec.js', '**/*.test.ts', '**/*.test.js'],
    rules: {
      // Projekt nutzt vitest globals via Config
      'vitest/prefer-importing-vitest-globals': 'off',
      // Padding-Regeln zu noisy für bestehende Codebase
      'vitest/padding-around-all': 'off',
      'vitest/padding-around-expect-groups': 'off',
      // mockNuxtImport muss auf Top-Level stehen, e2e nutzt Playwright
      'vitest/require-hook': 'off',
      // TypeScript Type-Narrowing-Pattern (if (result) { expect(...) })
      'vitest/no-conditional-expect': 'off',
      'vitest/no-conditional-in-test': 'off',
      // Zu strikt für bestehende Codebase
      'vitest/require-mock-type-parameters': 'off',
      'vitest/prefer-lowercase-title': 'off',
      'vitest/prefer-describe-function-title': 'off',
      'vitest/prefer-import-in-mock': 'off',
      'vitest/max-expects': 'off',
      // Mock-Callbacks sind async ohne await (Return-Type muss Promise sein)
      '@typescript-eslint/require-await': 'off',
      // @nuxt/test-utils Typen deklarieren renderSuspended/mountSuspended nicht als Promise
      '@typescript-eslint/await-thenable': 'off',
      // Auto-Fix ändert Semantik
      'vitest/prefer-called-with': 'off',
      'vitest/prefer-expect-type-of': 'off',
      'vitest/prefer-to-be-truthy': 'off',
      'vitest/prefer-to-be-falsy': 'off',
      'vitest/prefer-strict-boolean-matchers': 'off',
    },
  },
  ...css,
  {
    files: ['server/emails/**/*.css'],
    rules: {
      // Generierte Email-Templates nutzen Vendor-Prefixes
      'css/no-invalid-properties': 'off',
    },
  },

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

  // Type-aware TypeScript-Regeln (durch tsconfigPath aktiviert)
  {
    rules: {
      // Zu viele False Positives durch `any` aus Mocks und externen APIs
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      // Numbers/Arrays in Template-Literals sind in JS sicher
      '@typescript-eslint/restrict-template-expressions': 'off',
      // Methoden-Referenzen sind ein gängiges Pattern
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  // Prettier (MUSS letztes sein)
  ...prettier,
)
  // CSS files use a different language plugin — exclude them from JS/Vue-focused configs
  .override('nuxt/javascript', { ignores: ['**/*.css'] })
  .override('@intlify/vue-i18n:recommended:setup', { ignores: ['**/*.css'] })
  .override('@intlify/vue-i18n:recommended:rules', { ignores: ['**/*.css'] })
