import { expect, test } from '@playwright/test'

import {
  deleteAllMail,
  extractLoginTokenFromMail,
  getLatestMailFor,
  preparePage,
  waitForMailFor,
} from './helpers/maildev'
import { runSeedDemo, runSeedReset } from './helpers/stack'

import type { APIRequestContext, Page } from '@playwright/test'

// Dedicated seed user so the in-process rate limit on requestLoginLink
// (60s/user) does not collide with other full-stack suites.
const ALICE = 'alice@example.com'

const SYNC_SECRET = process.env.SYNC_SECRET ?? 'dev-sync-secret'

test.beforeAll(async () => {
  runSeedReset()
  runSeedDemo()
})

test.beforeEach(async () => {
  await deleteAllMail()
})

async function loginViaMagicLink(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await preparePage(page)
  await page.locator('#email-address-icon').fill(email)
  await page.getByRole('button', { name: 'Einloggen' }).click()
  await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })
  const mail = await waitForMailFor(email)
  const token = extractLoginTokenFromMail(mail)
  await page.goto(`/login/${token}`)
  await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: 15_000 })
}

async function triggerSendNewsletter(request: APIRequestContext): Promise<{
  sent: number
  skipped: number
  errors: number
  errorEmails: string[]
}> {
  const res = await request.post('/api/admin/send-newsletter', {
    headers: { Authorization: `Bearer ${SYNC_SECRET}` },
  })
  expect(res.status()).toBe(200)
  return (await res.json()) as {
    sent: number
    skipped: number
    errors: number
    errorEmails: string[]
  }
}

function extractUnsubscribeUrl(body: string): string {
  const match = /https?:\/\/[^\s<>"']+\/api\/newsletter\/unsubscribe\?token=[^\s<>"']+/.exec(body)
  if (!match) {
    throw new Error(`No unsubscribe URL found in mail body. Body: ${body.slice(0, 500)}`)
  }
  return match[0]
}

test.describe('full-stack newsletter', () => {
  test('subscribe → send → mail arrives → unsubscribe → send again → no mail', async ({
    page,
    context,
    request,
  }) => {
    await loginViaMagicLink(page, ALICE)

    // 1. Subscribe via the same endpoint the /settings UI uses.
    const subscribeRes = await context.request.post('/api/me/newsletter', {
      data: { subscribed: true },
    })
    expect(subscribeRes.status()).toBe(200)

    // 2. Clear any login/auth mail so we can pick out only the newsletter.
    await deleteAllMail()

    // 3. Trigger the bulk send.
    const firstRun = await triggerSendNewsletter(request)
    expect(firstRun.errors).toBe(0)
    expect(firstRun.sent).toBeGreaterThanOrEqual(1)

    // 4. Confirm the mail arrived for Alice and carries an unsubscribe link.
    const mail = await waitForMailFor(ALICE)
    const unsubscribeUrl = extractUnsubscribeUrl(mail.text || mail.html)

    // 5. Hit the unsubscribe link (one-click POST per RFC 8058).
    const unsubRes = await request.post(unsubscribeUrl)
    expect(unsubRes.status()).toBe(200)

    // 6. Empty inbox, trigger again — Alice must no longer receive anything.
    await deleteAllMail()
    const secondRun = await triggerSendNewsletter(request)
    expect(secondRun.errors).toBe(0)

    // The send count drops because Alice is now filtered out.
    expect(secondRun.sent).toBeLessThan(firstRun.sent)

    // 7. Verify no mail for Alice was sent on the second run. Maildev queues
    // are eventually consistent — small grace period before asserting empty.
    await page.waitForTimeout(1000)
    const aliceMail = await getLatestMailFor(ALICE)
    expect(aliceMail).toBeNull()
  })

  test('unsubscribe GET shows the German confirmation page', async ({ page, context, request }) => {
    await loginViaMagicLink(page, ALICE)

    const subscribeRes = await context.request.post('/api/me/newsletter', {
      data: { subscribed: true },
    })
    expect(subscribeRes.status()).toBe(200)

    await deleteAllMail()
    await triggerSendNewsletter(request)
    const mail = await waitForMailFor(ALICE)
    const unsubscribeUrl = extractUnsubscribeUrl(mail.text || mail.html)

    const res = await request.get(unsubscribeUrl)
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain('Newsletter abbestellt')
  })

  test('unsubscribe rejects unknown tokens', async ({ request }) => {
    const res = await request.post(
      '/api/newsletter/unsubscribe?token=this-token-does-not-exist-at-all',
    )
    expect(res.status()).toBe(404)
  })

  test('send-newsletter rejects without Bearer token', async ({ request }) => {
    const res = await request.post('/api/admin/send-newsletter')
    expect(res.status()).toBe(401)
  })

  test('send-newsletter rejects with wrong Bearer token', async ({ request }) => {
    const res = await request.post('/api/admin/send-newsletter', {
      headers: { Authorization: 'Bearer wrong-secret' },
    })
    expect(res.status()).toBe(401)
  })
})
