const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1', 'baikal', 'mariadb']

function isLocalUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return LOCAL_HOSTS.includes(url.hostname)
  } catch {
    return LOCAL_HOSTS.includes(value)
  }
}

interface GuardInput {
  davUrl?: string
  dbHost?: string
  /**
   * For *mass-destructive* CLIs (wipes all VCards, purges X-properties on
   * every VCard). When set, the prod override requires BOTH
   * `ALLOW_PRODUCTION=1` AND a second env var named here — defence in depth
   * so a stale `ALLOW_PRODUCTION=1` in a shell can't accidentally fire one
   * of these.
   */
  extraConfirmEnvVar?: string
}

export function assertLocalEnv({ davUrl, dbHost, extraConfirmEnvVar }: GuardInput): void {
  if (process.env.ALLOW_PRODUCTION === '1') {
    if (extraConfirmEnvVar) {
      if (process.env[extraConfirmEnvVar] !== '1') {
        console.error(
          `Refusing to run: ALLOW_PRODUCTION=1 alone is not enough for this CLI. ` +
            `Also set ${extraConfirmEnvVar}=1 to confirm you understand this is destructive on production.`,
        )
        process.exit(1)
      }
      console.warn(
        `⚠️  ALLOW_PRODUCTION=1 and ${extraConfirmEnvVar}=1 set — running against non-local resources.`,
      )
    } else {
      console.warn(
        '⚠️  ALLOW_PRODUCTION=1 set — running against non-local resources by user override.',
      )
    }
    return
  }

  const davLocal = isLocalUrl(davUrl)
  const dbLocal = !dbHost || LOCAL_HOSTS.includes(dbHost)

  if (davLocal && dbLocal) return

  const reasons: string[] = []
  if (!davLocal) reasons.push(`DAV_URL=${davUrl ?? '<unset>'} is not local`)
  if (!dbLocal) reasons.push(`DB_HOST=${dbHost} is not local`)

  console.error(
    'Refusing to run: this CLI is destructive and the environment looks like production.',
  )
  for (const r of reasons) console.error(`  - ${r}`)
  if (extraConfirmEnvVar) {
    console.error(
      `Override requires BOTH ALLOW_PRODUCTION=1 AND ${extraConfirmEnvVar}=1 — but think twice.`,
    )
  } else {
    console.error('Set ALLOW_PRODUCTION=1 to override (only if you are absolutely sure).')
  }
  process.exit(1)
}
