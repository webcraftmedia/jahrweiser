import dotenv from 'dotenv'
import { resolve } from 'path'
import { loadNuxt } from 'nuxt/kit'

dotenv.config({ path: resolve(process.cwd(), '.env') })
const nuxt = await loadNuxt({
  cwd: process.cwd(),
  dev: false, // oder false für production mode
  ready: false, // verhindert, dass der Server startet
})

export const config = nuxt.options.runtimeConfig
