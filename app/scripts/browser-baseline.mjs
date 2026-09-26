/**
 * Holds the client bundle to the browsers in .browserslistrc.
 *
 * The baseline is not a setting, it is a property of whatever the dependency
 * tree happens to emit this week. A single `npm update` can pull in a library
 * written in ES2022, and the failure that produces is invisible in every way
 * that matters: the build succeeds, the tests pass, the site works on every
 * machine in the office — and one member on an older phone gets markup that
 * never comes alive, with no error message anywhere to report. That is how
 * three loading dots on /register cost a week of guessing.
 *
 * So the check runs against the built output, after `nuxt build`:
 *
 *   1. .browserslistrc and `vite.build.target` still agree,
 *   2. no chunk uses syntax newer than the floor,
 *   3. every runtime API above the floor is covered by public/polyfills.js —
 *      and nothing in there is dead weight.
 *
 * Usage: npm run test:baseline
 */
/* eslint-disable no-console -- a build-time CLI check; its report *is* stdout */
/* eslint-disable no-catch-all/no-catch-all -- every throw here is a finding to
   report, not an error to propagate: a chunk that will not parse, a polyfill
   that will not run, a probe that comes back false. Rethrowing would abort the
   run and hide the remaining problems. */
/* eslint-disable security/detect-non-literal-fs-filename -- the paths are this
   repository's own build output, enumerated by readdirSync */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'

import * as acorn from 'acorn'
import browserslist from 'browserslist'

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const BUNDLE_DIR = join(APP_DIR, '.output/public/_nuxt')
const POLYFILLS = join(APP_DIR, 'public/polyfills.js')
const NUXT_CONFIG = join(APP_DIR, 'nuxt.config.ts')

/**
 * The ES edition the floor in .browserslistrc can parse. Raising the floor is
 * the only reason to touch this — it is checked against the browser versions
 * below so the two cannot drift apart silently.
 */
const ES_LEVEL = 2020

/** Minimum version per family that supports all of ES2020 syntax. */
const ES2020_SUPPORT = { chrome: 80, edge: 80, firefox: 72, safari: 13.1, ios_saf: 13.4 }

/**
 * Syntax that acorn accepts at ES_LEVEL but real browsers of that vintage do
 * not. BigInt is the one that bites: it is ES2020 on paper and Safari 14 in
 * practice, and a literal like `32n` cannot be polyfilled — it either parses
 * or the whole chunk is dead. rolldown downgrades this to a
 * `TOLERATED_TRANSFORM` warning in a build log nobody reads.
 */
const SYNTAX_FEATURES = [
  {
    name: 'BigInt literal',
    pattern: /[^\w$]\d+n[^\w$]/,
    since: { chrome: 67, edge: 79, firefox: 68, safari: 14, ios_saf: 14 },
  },
]

/** browserslist family → the name esbuild/rolldown knows it by. */
const ESBUILD_FAMILY = { chrome: 'chrome', edge: 'edge', firefox: 'firefox', safari: 'safari' }

/**
 * Runtime APIs newer than ES2020, each with the first version that has it.
 *
 * `strip` takes the API away from a scratch VM and `probe` asks whether
 * public/polyfills.js put it back *and got it right* — an earlier version of
 * this script grepped the file for the property name instead, which passed
 * happily while the polyfill was deleted, because the same name occurred on a
 * neighbouring line. A check that cannot fail is worse than no check: it makes
 * everyone stop looking.
 *
 * `probe: null` means the gap is handled at the call site and no polyfill is
 * expected.
 */
const RUNTIME_APIS = [
  {
    name: 'Array/String.prototype.at',
    pattern: /[\w)\]`'"]\.at\(\s*-?\d/,
    since: { chrome: 92, edge: 92, firefox: 90, safari: 15.4, ios_saf: 15.4 },
    strip: 'delete Array.prototype.at; delete String.prototype.at',
    probe: '[1,2,3].at(-1)===3 && [1,2,3].at(0)===1 && [1].at(9)===undefined && "abc".at(-1)==="c"',
  },
  {
    name: 'Object.hasOwn',
    pattern: /\bObject\.hasOwn\b/,
    since: { chrome: 93, edge: 93, firefox: 92, safari: 15.4, ios_saf: 15.4 },
    strip: 'delete Object.hasOwn',
    probe: 'Object.hasOwn({a:1},"a") && !Object.hasOwn({},"a")',
  },
  {
    name: 'Array.prototype.findLast(Index)',
    pattern: /\.findLast(Index)?\(/,
    since: { chrome: 97, edge: 97, firefox: 104, safari: 15.4, ios_saf: 15.4 },
    strip: 'delete Array.prototype.findLast; delete Array.prototype.findLastIndex',
    probe:
      '[1,2,3,4].findLast(function(n){return n%2}) === 3 && ' +
      '[1,2,3,4].findLastIndex(function(n){return n%2}) === 2 && ' +
      '[].findLastIndex(function(){return true}) === -1',
  },
  {
    name: 'Array.prototype.toSorted/toReversed',
    pattern: /\.to(Sorted|Reversed)\(/,
    since: { chrome: 110, edge: 110, firefox: 115, safari: 16.4, ios_saf: 16.4 },
    strip: 'delete Array.prototype.toSorted; delete Array.prototype.toReversed',
    // Also asserts the copy semantics: the point of these is not mutating.
    probe:
      '(function(){var a=[3,1,2];var b=a.toSorted();' +
      'return b[0]===1 && a[0]===3 && a.toReversed()[0]===2 && a[0]===3})()',
  },
  {
    name: 'String.prototype.replaceAll',
    pattern: /\.replaceAll\(/,
    since: { chrome: 85, edge: 85, firefox: 77, safari: 13.1, ios_saf: 13.4 },
    strip: 'delete String.prototype.replaceAll',
    probe: '"a-b-c".replaceAll("-","+")==="a+b+c" && "aXbXc".replaceAll(/X/g,"-")==="a-b-c"',
  },
  {
    name: 'Object.groupBy',
    pattern: /\bObject\.groupBy\b/,
    since: { chrome: 117, edge: 117, firefox: 119, safari: 17.4, ios_saf: 17.4 },
    strip: 'delete Object.groupBy',
    probe: 'typeof Object.groupBy === "function"',
  },
  {
    name: 'Array.prototype.with',
    pattern: /\.with\(\s*\d/,
    since: { chrome: 110, edge: 110, firefox: 115, safari: 16.4, ios_saf: 16.4 },
    strip: 'delete Array.prototype.with',
    probe: '(function(){var a=[1,2];return a.with(0,9)[0]===9 && a[0]===1})()',
  },
  {
    name: 'structuredClone',
    pattern: /\bstructuredClone\(/,
    since: { chrome: 98, edge: 98, firefox: 94, safari: 15.4, ios_saf: 15.4 },
    strip: 'delete globalThis.structuredClone',
    probe: 'typeof structuredClone === "function"',
  },
  {
    name: 'crypto.randomUUID',
    pattern: /\bcrypto\.randomUUID\(/,
    since: { chrome: 92, edge: 92, firefox: 95, safari: 15.4, ios_saf: 15.4 },
    strip: 'if (globalThis.crypto) delete globalThis.crypto.randomUUID',
    probe: 'typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"',
  },
  {
    // Nuxt guards its only call as `AbortSignal.timeout?.(n)`, so a browser
    // without it degrades instead of crashing.
    name: 'AbortSignal.timeout',
    pattern: /AbortSignal\.timeout(?!\?)/,
    since: { chrome: 103, edge: 103, firefox: 100, safari: 15.4, ios_saf: 15.4 },
    strip: null,
    probe: null,
  },
]

const problems = []
const notes = []

/** Lowest version per family that .browserslistrc still asks us to support. */
function resolveFloor() {
  const floor = {}
  for (const entry of browserslist(null, { path: APP_DIR })) {
    const [family, version] = entry.split(' ')
    // Ranges like "12.2-12.5" — the lower bound is the one that has to work.
    const lowest = parseFloat(String(version).split('-')[0])
    if (!Number.isNaN(lowest) && (!(family in floor) || lowest < floor[family])) {
      floor[family] = lowest
    }
  }
  return floor
}

/** 1. .browserslistrc, ES_LEVEL and vite.build.target must describe one thing. */
function checkConfigAgreement(floor) {
  for (const [family, needed] of Object.entries(ES2020_SUPPORT)) {
    if (family in floor && floor[family] < needed) {
      problems.push(
        `.browserslistrc allows ${family} ${floor[family]}, which cannot parse ES${ES_LEVEL} ` +
          `(needs ${needed}). Lower ES_LEVEL in this script and re-check the polyfills, ` +
          `or raise the floor.`,
      )
    }
  }

  const config = readFileSync(NUXT_CONFIG, 'utf8')
  const target = config.match(/target:\s*\[([^\]]*)\]/)
  if (!target) {
    problems.push('No `vite.build.target` found in nuxt.config.ts — the bundle has no floor.')
    return
  }
  const targets = [...target[1].matchAll(/['"]([a-z]+)([\d.]+)['"]/g)]
  for (const [, family, version] of targets) {
    const bl = Object.entries(ESBUILD_FAMILY).find(([, esbuild]) => esbuild === family)?.[0]
    if (bl && bl in floor && parseFloat(version) > floor[bl]) {
      problems.push(
        `vite.build.target says ${family}${version}, but .browserslistrc still supports ` +
          `${bl} ${floor[bl]}. The bundle would use syntax that browser cannot parse.`,
      )
    }
  }
  for (const family of Object.values(ESBUILD_FAMILY)) {
    if (!targets.some(([, name]) => name === family)) {
      problems.push(`vite.build.target does not constrain ${family}.`)
    }
  }
}

/** 2. Nothing in the output may need syntax newer than ES_LEVEL. */
function checkSyntax(files) {
  for (const [file, source] of files) {
    try {
      acorn.parse(source, { ecmaVersion: ES_LEVEL, sourceType: 'module' })
    } catch (error) {
      const near = source.slice(Math.max(0, (error.pos ?? 0) - 90), (error.pos ?? 0) + 40)
      problems.push(
        `${file} needs syntax newer than ES${ES_LEVEL}: ${error.message}\n` +
          `      near: …${near.replace(/\n/g, ' ')}…`,
      )
    }
  }
}

/** 2b. Syntax that parses as ES_LEVEL but is younger than the browser floor. */
function checkSyntaxFeatures(files, floor) {
  for (const feature of SYNTAX_FEATURES) {
    const hits = files.filter(([, source]) => feature.pattern.test(source)).map(([file]) => file)
    if (hits.length === 0) continue
    const missing = Object.entries(feature.since).filter(
      ([family, since]) => family in floor && floor[family] < since,
    )
    if (missing.length > 0) {
      problems.push(
        `${feature.name} in ${hits.slice(0, 3).join(', ')} — unsupported below ` +
          `${missing.map(([f, v]) => `${f} ${v}`).join(', ')}. Syntax cannot be polyfilled: ` +
          `raise the floor in .browserslistrc or get rid of the dependency.`,
      )
    }
  }
}

/**
 * 3. Every above-floor API in the bundle is polyfilled, and vice versa.
 *
 * The polyfill is executed in a context with those APIs removed and then asked
 * to prove it works, rather than being read for reassuring-looking strings. It
 * is the only check here that can catch a polyfill that exists but is wrong.
 */
function checkRuntimeApis(files, floor) {
  const polyfills = readFileSync(POLYFILLS, 'utf8')
  const sandbox = createContext({})
  for (const api of RUNTIME_APIS) {
    if (api.strip) runInContext(api.strip, sandbox)
  }
  try {
    runInContext(polyfills, sandbox)
  } catch (error) {
    problems.push(`public/polyfills.js does not run: ${error.message}`)
    return
  }
  const works = (api) => {
    try {
      return runInContext(api.probe, sandbox) === true
    } catch {
      return false
    }
  }

  for (const api of RUNTIME_APIS) {
    if (!api.probe) continue
    const hits = files.filter(([, source]) => api.pattern.test(source)).map(([file]) => file)
    const missing = Object.entries(api.since).filter(
      ([family, since]) => family in floor && floor[family] < since,
    )
    const needed = hits.length > 0 && missing.length > 0
    const provided = works(api)

    if (needed && !provided) {
      problems.push(
        `${api.name} is used in ${hits.length} chunk(s) (${hits.slice(0, 3).join(', ')}) and ` +
          `missing below ${missing.map(([f, v]) => `${f} ${v}`).join(', ')}, but ` +
          `public/polyfills.js does not supply a working one.`,
      )
    }
    if (!needed && provided) {
      notes.push(
        `public/polyfills.js supplies ${api.name}, which the bundle no longer needs — ` +
          `bytes every visitor downloads for nothing.`,
      )
    }
  }
}

if (!existsSync(BUNDLE_DIR)) {
  console.error(`No build found at ${BUNDLE_DIR} — run \`npm run build\` first.`)
  process.exit(1)
}

const files = readdirSync(BUNDLE_DIR)
  .filter((file) => file.endsWith('.js'))
  .map((file) => [file, readFileSync(join(BUNDLE_DIR, file), 'utf8')])

const floor = resolveFloor()
checkConfigAgreement(floor)
checkSyntax(files)
checkSyntaxFeatures(files, floor)
checkRuntimeApis(files, floor)

const describedFloor = Object.entries(floor)
  .map(([family, version]) => `${family} ${version}`)
  .join(', ')
console.log(`Browser baseline: ${describedFloor}`)
console.log(`Checked ${files.length} chunk(s) against ES${ES_LEVEL} + public/polyfills.js`)

for (const note of notes) console.log(`  note: ${note}`)

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`)
  for (const problem of problems) console.error(`  ✗ ${problem}`)
  console.error('\nSee docu/browser-support.md.')
  process.exit(1)
}

console.log('OK — the bundle runs on every browser in .browserslistrc.')
