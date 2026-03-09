import { loadNuxt } from 'nuxt/kit'

const nuxt = await loadNuxt({
  cwd: process.cwd(),
  dev: false, // oder false für production mode
  ready: false, // verhindert, dass der Server startet
})

export const config = nuxt.options.runtimeConfig
