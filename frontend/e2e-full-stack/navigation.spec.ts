import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { setTelegramChannels } from './helpers/db'
import {
  extractLoginTokenFromMail,
  preparePage,
  waitForMailFor,
  deleteAllMail,
} from './helpers/maildev'
import { runSeedDemo, runSeedReset } from './helpers/stack'

import type { Page } from '@playwright/test'

// One seeded user per test: /api/requestLoginLink is rate-limited per user
// (60s), so three logins as the same account in one file would be flaky.
const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
// The Blättchen is member content, not an admin feature — this account is
// simply the fourth seeded user, so the fourth test gets its own login.
const ADMIN = 'admin@example.com'

// The channels live in the sidecar table now (see docu/telegram-channels.md),
// so the suite seeds them there. Deployment content rather than demo data, so
// `cli:seed:demo` does not fill it and the suite owns it outright.
const CHANNELS = [
  { name: 'E2E Öffentlich', description: 'Für alle', url: 'https://t.me/e2e_public', public: true },
  { name: 'E2E Privat', url: 'https://t.me/+E2ePrivateInvite', public: false },
]

// The issue directory is the suite's own (BLAETTCHEN_DIR in
// playwright.full-stack.config.ts) — the real archive holds members' PDFs and
// is nothing a test may write into. The path is spelled out rather than read
// from the environment, so a stray BLAETTCHEN_DIR cannot point the cleanup at
// somebody's actual issues.
const ISSUES_DIR = path.resolve(process.cwd(), 'e2e-full-stack/.blaettchen')
const ISSUES = ['09_2025-06-14.pdf', '12_2026-05-01_Sonderausgabe Sommer.pdf']
// Enough of a PDF for the endpoint to serve and the browser to accept; the
// tests assert headers and status, not rendering.
const PDF_BYTES = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'

async function publishIssues(): Promise<void> {
  await mkdir(ISSUES_DIR, { recursive: true })
  for (const issue of ISSUES) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad aus zwei Testkonstanten, kein Eingabewert
    await writeFile(path.join(ISSUES_DIR, issue), PDF_BYTES, 'utf-8')
  }
}

async function withdrawIssues(): Promise<void> {
  // Only the files this suite created — never the directory wholesale.
  for (const issue of ISSUES) {
    await rm(path.join(ISSUES_DIR, issue), { force: true })
  }
}

test.beforeAll(async () => {
  runSeedReset()
  runSeedDemo()
  await setTelegramChannels(CHANNELS)
  await publishIssues()
})

test.afterAll(async () => {
  await setTelegramChannels([])
  await withdrawIssues()
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
  await page.goto(`/login/${extractLoginTokenFromMail(mail)}`)
  await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: 15_000 })
}

test.describe('icon rail', () => {
  test('hides the telegram entry when no channel is configured', async ({ page }) => {
    // An empty list reaches the client as [] — the entry has to disappear, and
    // the calendar must stay reachable.
    await setTelegramChannels([])
    await loginViaMagicLink(page, BOB)
    const rail = page.locator('nav[aria-label]').first()
    await expect(rail.locator('a[href="/"]')).toBeVisible()
    await expect(rail.locator('a[href="/telegram"]')).toHaveCount(0)

    await setTelegramChannels(CHANNELS)
    await page.reload()
    await preparePage(page)
    await expect(rail.locator('a[href="/telegram"]')).toHaveCount(1)
  })

  // One login for the whole flow: /api/requestLoginLink is rate-limited per
  // user, so a login per test would be flaky.
  test('navigates between calendar and telegram and tracks the active section', async ({
    page,
    browser,
  }) => {
    await loginViaMagicLink(page, ALICE)

    // The calendar redirected to /YYYY/MM — the rail must still mark it active,
    // which is the part a mocked useRoute in the unit test cannot prove.
    const rail = page
      .locator('nav[aria-label]')
      .filter({ has: page.locator('a[href="/telegram"]') })
    const desktopRail = rail.first()
    await expect(desktopRail).toBeVisible()
    await expect(desktopRail.locator('a[href="/"]')).toHaveAttribute('aria-current', 'page')
    await expect(desktopRail.locator('a[href="/telegram"]')).not.toHaveAttribute(
      'aria-current',
      'page',
    )
    // Icons only — no visible link text in the rail.
    expect((await desktopRail.innerText()).trim()).toBe('')

    // Navigate via the rail itself.
    await desktopRail.locator('a[href="/telegram"]').click()
    await expect(page).toHaveURL(/\/telegram$/)
    await expect(desktopRail.locator('a[href="/telegram"]')).toHaveAttribute('aria-current', 'page')
    await expect(desktopRail.locator('a[href="/"]')).not.toHaveAttribute('aria-current', 'page')

    // The channels come from the sidecar table via the authenticated API.
    await expect(page.getByText('E2E Öffentlich')).toBeVisible({ timeout: 10_000 })
    const privateLink = page.getByRole('link', { name: 'Beitreten' }).nth(1)
    await expect(privateLink).toHaveAttribute('href', 'https://t.me/+E2ePrivateInvite')
    await expect(privateLink).toHaveAttribute('target', '_blank')

    // Back to the calendar through the rail.
    await desktopRail.locator('a[href="/"]').click()
    // The calendar settles on its dated permalink, same as after login.
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/)

    // An anonymous visitor gets neither the page nor the invitations.
    const guestContext = await browser.newContext()
    const anonymous = await guestContext.request.get('/api/telegram-channels')
    expect(anonymous.status()).toBe(401)
    await guestContext.close()
  })

  // One login for the whole flow, same reason as above.
  test('publishes the Blättchen to members and to nobody else', async ({ page, browser }) => {
    // Start from an empty archive: the entry must not exist before the first
    // issue does.
    await withdrawIssues()
    await loginViaMagicLink(page, ADMIN)
    await expect(page.locator('nav[aria-label] a[href="/"]').first()).toBeVisible()
    await expect(page.locator('nav[aria-label] a[href="/blaettchen"]')).toHaveCount(0)

    // Publishing is dropping a PDF into the directory — no deploy, no restart.
    await publishIssues()
    await page.reload()
    await preparePage(page)

    const desktopRail = page
      .locator('nav[aria-label]')
      .filter({ has: page.locator('a[href="/blaettchen"]') })
      .first()
    await desktopRail.locator('a[href="/blaettchen"]').click()
    await expect(page).toHaveURL(/\/blaettchen$/)
    await expect(desktopRail.locator('a[href="/blaettchen"]')).toHaveAttribute(
      'aria-current',
      'page',
    )

    // Newest issue on top, dates taken from the file names.
    const issueLinks = page.locator('li a[href^="/api/blaettchen/"]')
    await expect(issueLinks).toHaveCount(2)
    await expect(page.locator('li time')).toHaveText([/1\. Mai 2026/, /14\. Juni 2025/])

    // Every link carries a label of its own — a screen reader's link list of
    // ten identical "Öffnen" entries would be useless. Needs the real
    // translations, which is why it lives here and not in the unit test.
    const labels = await issueLinks.evaluateAll((links) =>
      links.map((link) => link.getAttribute('aria-label') ?? ''),
    )
    expect(new Set(labels).size).toBe(2)
    expect(labels[0]).toContain('12')

    // The PDF itself comes back as a PDF, named after its issue.
    const href = await issueLinks.first().getAttribute('href')
    const pdf = await page.context().request.get(href!)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    expect(pdf.headers()['content-disposition']).toContain('Blaettchen-12-2026-05-01.pdf')
    expect(pdf.headers()['cache-control']).toContain('no-store')

    // The call for contributions carries the configured address. Asserted by
    // shape, not by value: a failure message must not print it.
    const contribute = page.locator('a[href^="mailto:"]')
    await expect(contribute).toHaveCount(1)
    expect(await contribute.getAttribute('href')).toContain('?subject=')

    // A name that is not an issue never reaches the file system.
    const traversal = await page
      .context()
      .request.get(`/api/blaettchen/${encodeURIComponent('../../nuxt.config.ts')}`)
    expect(traversal.status()).toBe(404)

    // An anonymous visitor gets neither the listing nor a single issue — a
    // direct link is not a way around the login.
    const guestContext = await browser.newContext()
    expect((await guestContext.request.get('/api/blaettchen')).status()).toBe(401)
    expect(
      (
        await guestContext.request.get(`/api/blaettchen/${encodeURIComponent(ISSUES[1]!)}`)
      ).status(),
    ).toBe(401)
    await guestContext.close()
  })
})
