import type { Page } from '@playwright/test'

interface MaildevMessage {
  id: string
  to: { address: string; name?: string }[]
  subject: string
  date: string
  text: string
  html: string
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

export async function deleteAllMail(): Promise<void> {
  await fetch(`${MAILDEV_URL}/email/all`, { method: 'DELETE' })
}

export async function getLatestMailFor(address: string): Promise<MaildevMessage | null> {
  const response = await fetch(`${MAILDEV_URL}/email`)
  if (!response.ok) {
    throw new Error(`Maildev API responded ${response.status}`)
  }
  const messages = (await response.json()) as MaildevMessage[]
  const matching = messages
    .filter((m) => m.to.some((t) => t.address.toLowerCase() === address.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date))
  return matching[0] ?? null
}

export async function waitForMailFor(address: string, timeoutMs = 10_000): Promise<MaildevMessage> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const msg = await getLatestMailFor(address)
    if (msg) return msg
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Timed out waiting for mail to ${address}`)
}

export function extractLoginTokenFromMail(message: MaildevMessage): string {
  const match = /\/login\/([a-f0-9]+)/.exec(message.html || message.text)
  if (!match) {
    throw new Error(`No login token found in mail body. Subject: ${message.subject}`)
  }
  return match[1]!
}
