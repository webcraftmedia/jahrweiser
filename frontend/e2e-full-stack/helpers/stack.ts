import { execSync } from 'node:child_process'

export function runSeedReset(): void {
  execSync('npm run cli:seed:reset', { stdio: 'inherit' })
}

export function runSeedDemo(): void {
  execSync('npm run cli:seed:demo', { stdio: 'inherit' })
}

export async function deleteAllMail(): Promise<void> {
  const url = process.env.MAILDEV_URL ?? 'http://localhost:1080'
  await fetch(`${url}/email/all`, { method: 'DELETE' })
}
