import { isMobileUserAgent } from '~/utils/device'
import { pwaHeadLinks } from '~/utils/pwaHead'

/**
 * The manifest in the server-rendered page, for phones and tablets.
 *
 * Added by the client alone, it arrived a moment after the page had loaded —
 * fine for Chrome, which watches for it, but Firefox and Safari look once, at
 * load. Without it they cannot install the app; what they offer instead is a
 * shortcut to the page that happens to be open. The server only has the user
 * agent to go on; the client plugin adds the same (keyed) tags for the devices
 * that hide behind a desktop one, such as the iPad (src/plugins/pwa.client.ts).
 */
export default defineNuxtPlugin(() => {
  const userAgent = useRequestHeaders(['user-agent'])['user-agent'] ?? ''
  if (isMobileUserAgent(userAgent)) useHead({ link: pwaHeadLinks() })
})
