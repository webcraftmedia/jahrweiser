/**
 * Holds the JavaScript the login page needs before it can be used.
 *
 * `size-limit` guards the sum of all chunks, which says nothing about one
 * route: a new import in the header, the layout or a plugin lands in the
 * login page's chunks and the total barely moves. The login page is where
 * that hurts — the most frequent support topic is "I cannot get in", and on a
 * slow phone the form is dead until every preloaded chunk is parsed and run.
 *
 * So the check asks the built server for /login, the way a phone does, and
 * adds up every script the page loads before hydrating — the entry and its
 * `modulepreload`s. Raw bytes, not gzip: parsing and compiling is what keeps a
 * cheap phone busy, and that scales with the unpacked size.
 *
 * Usage (after `nuxt build`): npm run test:size:login
 */
/* eslint-disable no-console -- a build-time CLI check; its report *is* stdout */
/* eslint-disable security/detect-non-literal-fs-filename -- the paths are this
   repository's own build output, named by its own HTML */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

/** The budget, in KiB of unpacked JavaScript. */
const LIMIT_KIB = 390

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const PUBLIC_DIR = join(APP_DIR, '.output/public')
const PORT = process.env.LOGIN_SIZE_PORT ?? '3099'
/** A phone: it gets the manifest and the install code a desktop does not. */
const PHONE_UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'

const server = spawn('node', [join(APP_DIR, '.output/server/index.mjs')], {
  env: {
    ...process.env,
    PORT,
    NUXT_SESSION_PASSWORD: '12345678901234567890123456789012',
  },
  stdio: 'ignore',
})

async function fetchLogin() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/login`, {
        headers: { 'user-agent': PHONE_UA },
      })
      if (response.ok) return await response.text()
      // eslint-disable-next-line no-catch-all/no-catch-all -- not listening yet: try again
    } catch {
      // Not up yet.
    }
    await sleep(100)
  }
  throw new Error('The built server did not answer /login')
}

try {
  const html = await fetchLogin()
  const scripts = [...new Set(html.match(/\/_nuxt\/[^"']+\.js/g) ?? [])]
  let raw = 0
  let gzip = 0
  for (const script of scripts) {
    const code = readFileSync(join(PUBLIC_DIR, script))
    raw += code.length
    gzip += gzipSync(code, { level: 9 }).length
  }
  const kib = (bytes) => (bytes / 1024).toFixed(1)
  console.log(
    `/login loads ${scripts.length} scripts: ${kib(raw)} KiB (${kib(gzip)} KiB gzip), limit ${LIMIT_KIB} KiB`,
  )
  if (raw > LIMIT_KIB * 1024) {
    console.error(
      'Over budget. Find out what the login page newly loads — usually an import in the header, the layout or a plugin that only some other page needs.',
    )
    process.exitCode = 1
  }
} finally {
  server.kill()
}
