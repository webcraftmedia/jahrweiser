// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { compileStyle, parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

/**
 * Vue compiles a scoped `:global(.dark) .x { … }` to a bare `.dark { … }` —
 * everything after the `:global()` is dropped. The declarations then land on
 * <html>, which carries the class, and inherit into every element on the page:
 * the trend charts drew white strokes around every hit target in dark mode for
 * exactly this reason. `.dark .x` is the selector that works.
 */
function vueFiles(dir: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test, der den eigenen Quellbaum durchläuft
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return vueFiles(full)
    return entry.name.endsWith('.vue') ? [full] : []
  })
}

const SRC = path.resolve(import.meta.dirname)

describe('scoped styles', () => {
  it.each(vueFiles(SRC).map((file) => [path.relative(SRC, file), file]))(
    '%s keeps every scoped rule scoped',
    (_name, file) => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- dito
      const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file })
      for (const style of descriptor.styles.filter((block) => block.scoped)) {
        const { code } = compileStyle({
          source: style.content,
          filename: file,
          id: 'data-v-test',
          scoped: true,
        })
        // A rule for `.dark` alone, outside any longer selector.
        expect(code).not.toMatch(/(^|[},]\s*)\.dark\s*\{/)
      }
    },
  )
})
