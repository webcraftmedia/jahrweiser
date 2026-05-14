import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

import { config } from './tools/config'
import { assertLocalEnv } from './tools/production-guard'

assertLocalEnv({ davUrl: config.DAV_URL, dbHost: config.DB_HOST })

const baseUrl = config.DAV_URL.replace(/\/+$/, '')

// Baikal returns HTTP 500 before its schema is initialized, which is the exact
// state we're in here (we provision the schema below). So any HTTP response —
// 200, 302, 401, 500 — proves the container is up enough to docker-exec into.
async function waitForBaikal(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/`, { method: 'GET' })
      if (res.status > 0) return
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Baikal not reachable at ${baseUrl} within ${timeoutMs}ms: ${String(lastErr)}`)
}

console.warn(`[baikal-bootstrap] waiting for Baikal at ${baseUrl} ...`)
await waitForBaikal()
console.warn('[baikal-bootstrap] Baikal is up; provisioning DAV admin user via docker compose exec')

// We run from frontend/, compose is one dir up.
const composeCwd = resolve(process.cwd(), '..')

try {
  // Copy fresh each time — bind-mounting a single file snapshots on container
  // create and ignores subsequent host edits, which surprised us once.
  execSync(
    'docker compose cp infra/baikal/provision-dav-user.php baikal:/tmp/provision-dav-user.php',
    { stdio: 'inherit', cwd: composeCwd, shell: '/bin/sh' },
  )
  execSync(
    'docker compose exec -T baikal php /tmp/provision-dav-user.php admin admin admin@example.com Admin',
    { stdio: 'inherit', cwd: composeCwd, shell: '/bin/sh' },
  )
} catch (err) {
  console.error('[baikal-bootstrap] docker compose exec failed:', (err as Error).message)
  console.error('Make sure `docker compose ps` shows the baikal service up.')
  process.exit(1)
}

console.warn('[baikal-bootstrap] done')
process.exit(0)
