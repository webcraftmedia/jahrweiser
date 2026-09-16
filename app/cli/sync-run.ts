import { syncDavToSidecar } from '../server/helpers/sync'

import { config } from './tools/config'
import { assertLocalEnv } from './tools/production-guard'

assertLocalEnv({ davUrl: config.DAV_URL, dbHost: config.DB_HOST })

const davConfig = {
  DAV_USERNAME: config.DAV_USERNAME,
  DAV_PASSWORD: config.DAV_PASSWORD,
  DAV_URL: config.DAV_URL,
  DAV_URL_CARD: config.DAV_URL_CARD,
}

const result = await syncDavToSidecar(davConfig)

if (result.skippedLocked) {
  console.warn('Sync skipped: another sync is in flight (lock held).')
  process.exit(0)
}

console.warn(
  `Sync complete: +${result.added} added, ~${result.updated} updated, -${result.deleted} deleted, ` +
    `${result.emailChanges} email changes, ${result.durationMs}ms.`,
)
process.exit(0)
