import { deviceEnv, pwaMode } from '~/utils/device'
import { installHintEligible, listenForInstallPrompt } from '~/utils/installPrompt'

/** Served by @vite-pwa/nuxt; content in nuxt.config.ts (`pwa.manifest`). */
export const MANIFEST_URL = '/manifest.webmanifest'

/** Loads the registration code only for the installed app. */
async function startServiceWorker(enabled: boolean) {
  const { registerServiceWorker } = await import('~/utils/serviceWorker')
  registerServiceWorker(enabled)
}

/**
 * Decides which part of the installable-app code a visitor gets (docu/pwa.md):
 *
 * - desktop browser: nothing. No manifest link — its presence is what makes
 *   Chrome and Edge put an install button into the address bar — and no
 *   service worker.
 * - phone or tablet browser: the manifest link and the install hint (a lazy
 *   chunk, see layouts/default.vue). No service worker: its precache would be
 *   a download over mobile data for everyone who never installs.
 * - installed app: the manifest link (Android re-reads it to update the
 *   installed app) and the service worker with the full precache, loaded on
 *   demand.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const mode = pwaMode(deviceEnv())
  if (mode === 'desktop') return

  useHead({ link: [{ rel: 'manifest', href: MANIFEST_URL }] })

  if (mode === 'installed') {
    // Not awaited: the app must not wait for the worker. No worker exists in
    // development, and none is registered while the kill switch is on — the
    // self-destroying one would otherwise be re-registered after every
    // reload it triggers. A chunk that fails to load leaves the app as it is
    // without a worker.
    const enabled = useRuntimeConfig().public.serviceWorker && !import.meta.dev
    startServiceWorker(enabled).catch(() => {})
    return
  }

  listenForInstallPrompt()
  nuxtApp.hook('app:mounted', () => {
    installHintEligible.value = true
  })
})
