import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const BAIKAL_URL = process.env.BAIKAL_URL ?? 'http://localhost:8088'
const DAV_USER = 'admin'
const DAV_PASSWORD = 'admin'

const composeCwd = resolve(process.cwd(), '..')

const authHeader = `Basic ${Buffer.from(`${DAV_USER}:${DAV_PASSWORD}`).toString('base64')}`

interface DavUserSeed {
  uid: string
  email: string
  displayName: string
  role?: 'user' | 'admin'
  tags?: string[]
}

function buildVCard({ uid, email, displayName, role, tags }: DavUserSeed): string {
  const lines = ['BEGIN:VCARD', 'VERSION:4.0', `UID:${uid}`, `FN:${displayName}`, `EMAIL:${email}`]
  if (role) lines.push(`X-ROLE:${role}`)
  if (tags && tags.length > 0) lines.push(`X-ADMIN-TAGS:${tags.join(',')}`)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

export async function createDavUser(seed: DavUserSeed): Promise<void> {
  const url = `${BAIKAL_URL}/dav.php/addressbooks/admin/default/${seed.uid}.vcf`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: authHeader, 'Content-Type': 'text/vcard; charset=utf-8' },
    body: buildVCard(seed),
  })
  if (!res.ok) throw new Error(`createDavUser failed: ${res.status} ${await res.text()}`)
}

export async function updateDavUser(uid: string, seed: Omit<DavUserSeed, 'uid'>): Promise<void> {
  const url = `${BAIKAL_URL}/dav.php/addressbooks/admin/default/${uid}.vcf`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: authHeader, 'Content-Type': 'text/vcard; charset=utf-8' },
    body: buildVCard({ uid, ...seed }),
  })
  if (!res.ok) throw new Error(`updateDavUser failed: ${res.status} ${await res.text()}`)
}

export async function deleteDavUser(uid: string): Promise<void> {
  const url = `${BAIKAL_URL}/dav.php/addressbooks/admin/default/${uid}.vcf`
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: authHeader } })
  if (res.status !== 204 && res.status !== 200 && res.status !== 404) {
    throw new Error(`deleteDavUser failed: ${res.status}`)
  }
}

export async function triggerSync(): Promise<{ added: number; updated: number; deleted: number }> {
  const secret = process.env.SYNC_SECRET ?? 'dev-sync-secret'
  const res = await fetch(
    `${process.env.E2E_BASE_URL ?? 'http://localhost:3000'}/api/admin/sync-now`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    },
  )
  if (!res.ok) throw new Error(`sync-now failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as { added: number; updated: number; deleted: number }
}

export function mariadb(sql: string): string {
  return execSync(
    `docker compose exec -T mariadb mariadb -u jahrweiser -pjahrweiser jahrweiser -se "${sql.replaceAll('"', '\\"')}"`,
    { cwd: composeCwd, shell: '/bin/sh' },
  )
    .toString()
    .trim()
}

export function getVCardUrlByEmail(email: string): string | null {
  // The seeded VCards have random sha256 filenames. To find one by email we
  // peek at Baikal's cards table directly — much simpler than parsing PROPFIND.
  const out = execSync(
    `docker compose exec -T baikal sqlite3 /var/www/baikal/Specific/db/db.sqlite ` +
      `"SELECT uri FROM cards WHERE carddata LIKE '%EMAIL:${email}%' LIMIT 1;"`,
    { cwd: composeCwd, shell: '/bin/sh' },
  )
    .toString()
    .trim()
  if (!out) return null
  return `${BAIKAL_URL}/dav.php/addressbooks/admin/default/${out}`
}
