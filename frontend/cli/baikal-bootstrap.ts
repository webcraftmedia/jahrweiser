import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

import { config } from './tools/config'
import { assertLocalEnv } from './tools/production-guard'

assertLocalEnv({ davUrl: config.DAV_URL, dbHost: config.DB_HOST })

const baseUrl = config.DAV_URL.replace(/\/+$/, '')

async function waitForBaikal(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/dav.php/`, { method: 'OPTIONS' })
      if (res.status >= 200 && res.status < 500) return
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(
    `Baikal not reachable at ${baseUrl}/dav.php/ within ${timeoutMs}ms: ${String(lastErr)}`,
  )
}

console.warn(`[baikal-bootstrap] waiting for Baikal at ${baseUrl} ...`)
await waitForBaikal()
console.warn('[baikal-bootstrap] Baikal is up; provisioning DAV admin user via docker compose exec')

// We run from frontend/, compose is one dir up.
const composeCwd = resolve(process.cwd(), '..')

try {
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
