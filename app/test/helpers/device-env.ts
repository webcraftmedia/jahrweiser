import type { DeviceEnv } from '~/utils/device'

/** Real user agents, trimmed to the parts the heuristics read. */
export const UA = {
  iPhoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iPadDesktopClass:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  /** Facebook's in-app browser on Android: a WebView, no install of any kind. */
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0]',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
}

/** A device: no client hints, no touch, no matching media query unless given. */
export function env(overrides: Partial<DeviceEnv> & { media?: string[] } = {}): DeviceEnv {
  const { media = [], ...rest } = overrides
  return {
    userAgent: UA.windowsChrome,
    maxTouchPoints: 0,
    matchMedia: (query) => ({ matches: media.includes(query) }),
    ...rest,
  }
}
