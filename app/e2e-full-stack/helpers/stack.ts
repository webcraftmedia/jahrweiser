import { execSync } from 'node:child_process'

export function runSeedReset(): void {
  execSync('npm run cli:seed:reset', { stdio: 'inherit' })
}

export function runSeedDemo(): void {
  execSync('npm run cli:seed:demo', { stdio: 'inherit' })
}
