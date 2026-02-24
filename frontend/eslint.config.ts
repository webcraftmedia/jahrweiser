import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import {
  eslint as it4cEslint,
  security,
  comments,
  json,
  yaml,
  vitest,
  css,
  prettier,
  typescript as it4cTypescript,
  // TODO: vue3-Modul exportiert auch @typescript-eslint-Regeln (via @vue/eslint-config-typescript).
  // Diese sind redundant zum typescript-Modul und haben teils schwächere Konfiguration
  // (z.B. no-unused-vars ohne argsIgnorePattern). In eslint-config-it4c nur vue/*-Regeln exportieren.
  vue3 as it4cVue3,
  // TODO: importX-Modul exportiert über neostandard() auch n/*, promise/*, react/*
  // und ESLint-Core-Regeln. In eslint-config-it4c nur import-x/*-Regeln exportieren.
  importX as it4cImportX,
} from 'eslint-config-it4c'

import withNuxt from './.nuxt/eslint.config.mjs'
// TODO: `node` und `promise` Module aus eslint-config-it4c sind nicht self-contained —
// sie registrieren ihr Plugin nicht selbst (eslint-plugin-n / eslint-plugin-promise).
// Bug in eslint-config-it4c melden, dann hier einbinden.

// it4c ESLint-Basisregeln extrahieren (recommended + custom, kein Plugin/Parser-Overlap mit Nuxt)
const it4cEslintRules = Object.assign({}, ...it4cEslint.map((c) => c.rules))

// it4c TypeScript-Regeln extrahieren (Plugin/Parser-Setup wird von Nuxt via tsconfigPath bereitgestellt)
const it4cTsRules = Object.assign({}, ...it4cTypescript.map((c) => c.rules))

// it4c Vue3-Regeln extrahieren (Plugin/Parser-Setup wird von Nuxt bereitgestellt)
const it4cVue3Rules = Object.assign({}, ...it4cVue3.map((c) => c.rules))

// it4c Import-X-Regeln extrahieren und auf Nuxt-Pluginname `import` umbenennen
// (Nuxt registriert eslint-plugin-import-x als `import`, it4c als `import-x`)
// TODO: importX-Modul nutzt neostandard() als Quelle für import-x-Regeln, exportiert dadurch
// aber auch 129 Fremdregeln (n/*, promise/*, react/*, ESLint-Core). In eslint-config-it4c
// die import-x-Regeln direkt aus eslint-plugin-import-x zusammenstellen statt über neostandard.
// Dann kann der .filter() hier entfernt werden.
const it4cImportRules = Object.fromEntries(
  Object.entries(Object.assign({}, ...it4cImportX.map((c) => c.rules)))
    .filter(([key]) => key.startsWith('import-x/'))
    .map(([key, value]) => [key.replace('import-x/', 'import/'), value]),
)

// TODO: no-catch-all gehört nicht ins TypeScript-Modul — ist ein allgemeines JS-Pattern.
// In eslint-config-it4c ins `eslint`-Basismodul verschieben, dann hier entfernen.
delete it4cTsRules['no-catch-all/no-catch-all']

export default withNuxt(
  { ignores: ['.nuxt.old/', '.claude/'] },
  // it4c ESLint-Basisregeln (recommended + no-console, no-unused-vars, no-void)
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,vue}'],
    rules: it4cEslintRules,
  },
  {
    rules: {
      // TypeScript-Äquivalente (@typescript-eslint/*) übernehmen diese Aufgaben besser
      'no-unused-vars': 'off',
      // TypeScript prüft Undefiniertes statisch; Nuxt Auto-Imports erzeugen False Positives
      'no-undef': 'off',
      // console.warn/error für Error-Handling erlauben, nur console.log verbieten
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // it4c Vue3-Regeln (recommended + custom, Plugin wird von Nuxt bereitgestellt)
  // Muss VOR TypeScript-Regeln stehen, da vue3 schwächere @typescript-eslint-Regeln mitbringt
  {
    files: ['**/*.vue', '**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    rules: it4cVue3Rules,
  },
  // it4c TypeScript-Regeln (strictTypeChecked + custom Rules)
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    rules: it4cTsRules,
  },
  // it4c Import-Regeln (Plugin wird von Nuxt als `import` bereitgestellt)
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,vue}'],
    rules: it4cImportRules,
  },
  {
    rules: {
      // TypeScript + Nuxt-Aliase (~, #imports, #app) werden nicht aufgelöst
      'import/no-unresolved': 'off',
      // Nuxt-generierter Export (withNuxt) ist default + named zugleich
      'import/no-named-as-default': 'off',
      // Nuxt-Konvention: relative Parent-Imports (../components/) sind üblich
      'import/no-relative-parent-imports': 'off',
      // .vue/.svg Extensions sind in Nuxt nötig
      'import/extensions': 'off',
      // Namespace-Imports für Typen (import type * as X) sind gängig
      'import/no-namespace': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.spec.js', '**/*.test.ts', '**/*.test.js', 'test/**'],
    rules: {
      // Test-Setup Side-Effect-Imports (import './setup') sind üblich
      'import/no-unassigned-import': 'off',
      // devDependencies in Tests sind korrekt
      'import/no-extraneous-dependencies': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    rules: {
      // Nuxt benennt Pages/Layouts nach Dateipfad — Single-Word-Namen sind korrekt
      'vue/multi-word-component-names': 'off',
    },
  },
  // it4c-Module (self-contained, kein Nuxt-Overlap)
  ...security,
  {
    files: ['cli/**'],
    rules: {
      // CLI-Tools nutzen legitimerweise dynamische Dateipfade
      'security/detect-non-literal-fs-filename': 'off',
      // CLI-Tools brauchen Console-Output
      'no-console': 'off',
      // CLI devDependencies sind korrekt
      'import/no-extraneous-dependencies': 'off',
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
      // Auto-Fix von async auf Mock-Callbacks verursacht Timing-Probleme (extra Microtask-Tick)
      '@typescript-eslint/promise-function-async': 'off',
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

  // Overrides für TypeScript-Regeln (it4c strictTypeChecked + custom)
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
      // Non-null assertion (!) ist ein gängiges Pattern (z.B. find()!, Array-Zugriff nach Validierung)
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Return-Types auf Exports: nützlich für Libraries, zu strikt für Projekt-Code
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Projekt nutzt || für Env-Vars und optionale Strings (leerer String = fehlend)
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
    },
  },

  // Prettier (MUSS letztes sein)
  ...prettier,
)
  // CSS files use a different language plugin — exclude them from JS/Vue-focused configs
  .override('nuxt/javascript', { ignores: ['**/*.css'] })
  .override('@intlify/vue-i18n:recommended:setup', { ignores: ['**/*.css'] })
  .override('@intlify/vue-i18n:recommended:rules', { ignores: ['**/*.css'] })
