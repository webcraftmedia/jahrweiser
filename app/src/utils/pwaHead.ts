import pwaIcons from '~/../assets/pwa-icons.json'

/** Served by @vite-pwa/nuxt; content in nuxt.config.ts (`pwa.manifest`). */
export const MANIFEST_URL = '/manifest.webmanifest'

/**
 * What a phone or tablet gets in the head: the manifest, and the full-bleed
 * icon as a large page icon for browsers that pick one from the page rather
 * than from the manifest. Keyed, so the server's and the client's copy are one
 * tag (src/plugins/pwa.server.ts, src/plugins/pwa.client.ts). Desktop browsers
 * get neither: the manifest is what puts an install button into their address
 * bar, and their tab keeps the round favicon.
 */
export function pwaHeadLinks() {
  return [
    { key: 'pwa-manifest', rel: 'manifest', href: MANIFEST_URL },
    {
      key: 'pwa-icon',
      rel: 'icon',
      type: 'image/png',
      sizes: '192x192',
      href: pwaIcons['icon-192'].src,
    },
  ]
}
