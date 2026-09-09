import { mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import {
  deleteAllMail,
  extractLoginTokenFromMail,
  preparePage,
  waitForMailFor,
} from './helpers/maildev'
import { runSeedDemo, runSeedReset } from './helpers/stack'

import type { Page } from '@playwright/test'

const ADMIN = 'admin@example.com'

// The suite's own issue directory (BLAETTCHEN_DIR in
// playwright.full-stack.config.ts), spelled out rather than read from the
// environment so cleanup can never point at a real archive.
const ISSUES_DIR = path.resolve(process.cwd(), 'e2e-full-stack/.blaettchen')
// Numbers this suite owns. Anything else in the directory belongs to another
// spec and is left alone.
const OWNED = [13, 14]

/** A small but genuine PDF — the endpoint checks the magic bytes. */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')

async function removeOwnedIssues(): Promise<void> {
  const entries = await readdir(ISSUES_DIR).catch(() => [])
  for (const entry of entries) {
    if (OWNED.some((number) => entry.startsWith(`${number}_`))) {
      await rm(path.join(ISSUES_DIR, entry), { force: true })
    }
  }
}

test.beforeAll(async () => {
  runSeedReset()
  runSeedDemo()
  await mkdir(ISSUES_DIR, { recursive: true })
  await removeOwnedIssues()
})

test.afterAll(async () => {
  await removeOwnedIssues()
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

test.describe('admin: publishing the Blättchen', () => {
  // One login for the whole flow — each step depends on the previous one's
  // state on disk anyway.
  test('uploads, renames, replaces and deletes an issue', async ({ page, browser }) => {
    await loginViaMagicLink(page, ADMIN)
    await page.goto('/admin/blaettchen')
    await preparePage(page)

    const fileInput = page.locator('#blaettchen-file')
    const number = page.locator('#blaettchen-number')
    const date = page.locator('#blaettchen-date')
    const subtitle = page.locator('#blaettchen-title')
    const submit = page.getByRole('button', { name: 'Hochladen' })

    // 1. An old-style name tells the form nothing — the editor fills it in, and
    //    the server names the file.
    await fileInput.setInputFiles({
      name: 'GG&G Blaettche 2026-12.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    })
    await expect(number).toHaveValue('')
    await expect(date).toHaveValue('')
    await expect(submit).toBeDisabled()

    await number.fill('13')
    await date.fill('2026-09-01')
    await expect(page.locator('code')).toHaveText('13_2026-09-01.pdf')
    await submit.click()
    await expect(page.getByText('13_2026-09-01.pdf wurde veröffentlicht.')).toBeVisible({
      timeout: 10_000,
    })
    // The form is clear again, so the same issue cannot go up twice by accident.
    await expect(number).toHaveValue('')

    // 2. A name that already follows the convention fills the fields itself.
    await fileInput.setInputFiles({
      name: '14_2026-11-11_Sonderausgabe Herbst.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    })
    await expect(number).toHaveValue('14')
    await expect(date).toHaveValue('2026-11-11')
    await expect(subtitle).toHaveValue('Sonderausgabe Herbst')
    await submit.click()
    await expect(
      page.getByText('14_2026-11-11_Sonderausgabe Herbst.pdf wurde veröffentlicht.'),
    ).toBeVisible({ timeout: 10_000 })

    // 3. Re-using a number is refused until the replace box is ticked, and then
    //    the differently named predecessor is gone rather than duplicated.
    await fileInput.setInputFiles({
      name: '14_2026-11-18.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    })
    const replace = page.locator('#blaettchen-replace')
    await expect(replace).toBeVisible()
    await submit.click()
    await expect(page.getByText('Diese Ausgabe gibt es schon.')).toBeVisible({ timeout: 10_000 })

    await replace.check()
    await submit.click()
    await expect(page.getByText('14_2026-11-18.pdf wurde veröffentlicht.')).toBeVisible({
      timeout: 10_000,
    })
    const listed = page.locator('li', { hasText: '14_' })
    await expect(listed).toHaveCount(1)
    await expect(listed).toContainText('14_2026-11-18.pdf')

    // 4. What was uploaded is what members can read.
    const href = await page.locator('li a[href^="/api/blaettchen/"]').first().getAttribute('href')
    const pdf = await page.context().request.get(href!)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')

    await page.goto('/blaettchen')
    await preparePage(page)
    await expect(page.locator('li time')).toContainText(['18. November 2026', '1. September 2026'])

    // 5. Deleting takes two clicks and really removes the file.
    await page.goto('/admin/blaettchen')
    await preparePage(page)
    const row = page.locator('li', { hasText: '14_2026-11-18.pdf' })
    await row.getByRole('button', { name: 'Löschen', exact: true }).click()
    await row.getByRole('button', { name: 'Wirklich löschen' }).click()
    await expect(page.locator('li', { hasText: '14_' })).toHaveCount(0, { timeout: 10_000 })
    const gone = await page.context().request.get('/api/blaettchen/14_2026-11-18.pdf')
    expect(gone.status()).toBe(404)

    // 6. Publishing is not something an anonymous request can do.
    const guestContext = await browser.newContext()
    const anonymous = await guestContext.request.post('/api/admin/blaettchen/upload', {
      multipart: {
        number: '99',
        date: '2026-01-01',
        file: { name: 'x.pdf', mimeType: 'application/pdf', buffer: PDF },
      },
    })
    expect(anonymous.status()).toBe(401)
    await guestContext.close()
  })
})
