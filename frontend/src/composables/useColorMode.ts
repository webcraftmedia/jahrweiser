const STORAGE_KEY = 'jahrweiser-dark'

const isDark = ref(false)
let initialized = false

function apply(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
}

function toggle() {
  const willBeDark = !isDark.value

  // Skip animation if user prefers reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    isDark.value = willBeDark
    apply(isDark.value)
    localStorage.setItem(STORAGE_KEY, String(isDark.value))
    return
  }

  // Remove any in-progress overlay
  document.querySelector('.color-switch-overlay')?.remove()

  // Light→Dark: reveal from bottom-left (overlay shrinks toward top-right)
  // Dark→Light: reveal from top-left (overlay shrinks toward bottom-right)
  const anchor = willBeDark ? '100% 0%' : '100% 100%'

  // Create overlay showing the OLD background color
  const overlay = document.createElement('div')
  overlay.className = 'color-switch-overlay'
  overlay.style.backgroundColor = willBeDark ? '#faf5eb' : '#1a1714'
  overlay.style.clipPath = `circle(150% at ${anchor})`
  document.body.appendChild(overlay)

  // Force paint so the overlay is visible before we change colors beneath it
  void overlay.offsetHeight

  // Apply actual color change (hidden behind the overlay)
  isDark.value = willBeDark
  apply(isDark.value)
  localStorage.setItem(STORAGE_KEY, String(isDark.value))

  // Shrink overlay to reveal new colors
  requestAnimationFrame(() => {
    overlay.style.clipPath = `circle(0% at ${anchor})`
  })

  overlay.addEventListener('transitionend', () => overlay.remove())
  setTimeout(() => overlay.remove(), 1100)
}

export function useColorMode() {
  if (!initialized && import.meta.client) {
    initialized = true

    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      isDark.value = stored === 'true'
    } else {
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    apply(isDark.value)
  }

  return { isDark: readonly(isDark), toggle }
}
