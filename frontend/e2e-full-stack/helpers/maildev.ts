import type { Page } from '@playwright/test'

interface MaildevMessage {
  id: string
  to: { address: string; name?: string }[]
  subject: string
  // MailDev 3 types these as optional; 2.x always populated them.
  date?: string
  text?: string
  html?: string
}

/**
 * Quiets animations so Playwright's stability checks pass, then waits for
 * Nuxt/Vue hydration. Mirrors the helper from the mock e2e suite.
 */
export async function preparePage(page: Page): Promise<void> {
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; }' })
  await page.waitForFunction(() => {
    const nuxt = document.getElementById('__nuxt')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(nuxt as any)?.__vue_app__) return false
    return !document.querySelector('[data-server-rendered]')
  })
  await page.waitForTimeout(200)
}

const MAILDEV_URL = process.env.MAILDEV_URL ?? 'http://localhost:1080'

// The maildev image is intentionally unpinned, and MailDev 3 moved the REST
// API from /email to /api/email. Probe once and remember whichever layout the
// running container serves, so the suite works against 2.x and 3.x alike.
let apiBase: string | null = null

async function resolveApiBase(): Promise<string> {
  if (apiBase) return apiBase
  // A 2.x server has no /api prefix and answers 404 here.
  const response = await fetch(`${MAILDEV_URL}/api/email`)
  apiBase = response.ok ? `${MAILDEV_URL}/api` : MAILDEV_URL
  return apiBase
}

export async function deleteAllMail(): Promise<void> {
  const base = await resolveApiBase()
  await fetch(`${base}/email/all`, { method: 'DELETE' })
}

export async function getAllMail(): Promise<MaildevMessage[]> {
  const base = await resolveApiBase()
  const response = await fetch(`${base}/email`)
  if (!response.ok) {
    throw new Error(`Maildev API responded ${response.status} for ${base}/email`)
  }
  const body: unknown = await response.json()
  if (!Array.isArray(body)) {
    // Guards against a future API reshuffle silently degrading into a
    // confusing "no mail arrived" timeout further down.
    throw new Error(
      `Maildev API at ${base}/email returned ${JSON.stringify(body).slice(0, 200)} instead of an array`,
    )
  }
  return body as MaildevMessage[]
}

/** All mail addressed to `address`, newest first. */
export async function getMailFor(address: string): Promise<MaildevMessage[]> {
  const messages = await getAllMail()
  return messages
    .filter((m) => m.to.some((t) => t.address.toLowerCase() === address.toLowerCase()))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

export async function getLatestMailFor(address: string): Promise<MaildevMessage | null> {
  const matching = await getMailFor(address)
  return matching[0] ?? null
}

export async function waitForMailFor(address: string, timeoutMs = 10_000): Promise<MaildevMessage> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown = null
  while (Date.now() < deadline) {
    try {
      const msg = await getLatestMailFor(address)
      if (msg) return msg
      // eslint-disable-next-line no-catch-all/no-catch-all -- Poll-Schleife: der letzte Fehler wird gemerkt und in der Timeout-Meldung ausgegeben
    } catch (error) {
      // Transient socket errors (Maildev closing keep-alive connections,
      // momentary DNS hiccup) shouldn't fail the wait — keep polling until
      // the deadline, but surface the last one if we never succeed.
      lastError = error
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  const suffix = lastError instanceof Error ? ` (last error: ${lastError.message})` : ''
  throw new Error(`Timed out waiting for mail to ${address}${suffix}`)
}

export function extractLoginTokenFromMail(message: MaildevMessage): string {
  const match = /\/login\/([a-f0-9]+)/.exec(message.html || message.text)
  if (!match) {
    throw new Error(`No login token found in mail body. Subject: ${message.subject}`)
  }
  return match[1]!
}
