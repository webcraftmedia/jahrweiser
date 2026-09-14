const STORAGE_KEY = 'jahrweiser-dark'

/** Matches the transition on `.color-switch-circle` in assets/css/jahrweiser.css. */
const SWEEP_MS = 900

const isDark = ref(false)
let initialized = false
let pendingFrame: number | null = null

function apply(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
}

function toggle() {
  const willBeDark = !isDark.value

  isDark.value = willBeDark
  localStorage.setItem(STORAGE_KEY, String(isDark.value))

  // Skip animation if user prefers reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply(isDark.value)
    return
  }

  // Remove any in-progress sweep — including the frame callback it is waiting
  // on, which would otherwise apply the *previous* toggle's colour.
  if (pendingFrame !== null) cancelAnimationFrame(pendingFrame)
  document.querySelector('.color-switch-overlay')?.remove()

  // Light→Dark: reveal from bottom-left (the circle shrinks toward top-right)
  // Dark→Light: reveal from top-left (the circle shrinks toward bottom-right)
  const width = document.documentElement.clientWidth
  const height = document.documentElement.clientHeight
  const anchorX = width
  const anchorY = willBeDark ? 0 : height

  // This used to be `clip-path: circle(150% at <anchor>)`, whose percentage
  // radius resolves against `hypot(width, height) / sqrt(2)`. Reproducing that
  // radius keeps the sweep's geometry and timing exactly as they were.
  // Rounded up: whole pixels keep the inline style readable, and erring large
  // can only ever overshoot the coverage the sweep already has.
  const radius = Math.ceil((1.5 * Math.hypot(width, height)) / Math.SQRT2)

  const overlay = document.createElement('div')
  overlay.className = 'color-switch-overlay'

  // The circle carries the OLD background colour, so the page underneath can
  // change out of sight.
  const circle = document.createElement('div')
  circle.className = 'color-switch-circle'
  circle.style.backgroundColor = willBeDark ? '#faf5eb' : '#1a1714'
  circle.style.width = `${radius * 2}px`
  circle.style.height = `${radius * 2}px`
  circle.style.left = `${anchorX - radius}px`
  circle.style.top = `${anchorY - radius}px`
  overlay.appendChild(circle)
  document.body.appendChild(overlay)

  // Two frames, not the `void el.offsetHeight` this replaces: that flushes
  // layout, not paint. The colour flip has to land after the overlay has been
  // on screen once — if the new full-screen layer takes an extra frame to
  // paint (Android), a single frame of the already-switched page shows
  // through, which reads as a flash.
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = null
      apply(willBeDark)
      circle.style.transform = 'scale(0)'
    })
  })

  // transitionend bubbles up from the circle.
  overlay.addEventListener('transitionend', () => {
    overlay.remove()
  })
  setTimeout(() => {
    overlay.remove()
  }, SWEEP_MS + 200)
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
