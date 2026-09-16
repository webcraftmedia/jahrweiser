const ZOOM_KEY = 'jahrweiser-zoom'

const zoomLevel = ref(1.0)
let initialized = false

export function useZoom() {
  if (!initialized && import.meta.client) {
    initialized = true

    const stored = localStorage.getItem(ZOOM_KEY)
    if (stored !== null) {
      const parsed = parseFloat(stored)
      if (!Number.isNaN(parsed) && parsed >= 0.8 && parsed <= 1.8) {
        zoomLevel.value = parsed
      }
    }

    watch(zoomLevel, (val) => {
      localStorage.setItem(ZOOM_KEY, String(val))
    })
  }

  const chromeZoom = computed(() => 1 + (zoomLevel.value - 1) * 0.3)
  // Login page: 0.8–1.0 unchanged, 1.0–1.8 → 1.0–1.5
  const loginZoom = computed(() =>
    zoomLevel.value <= 1 ? zoomLevel.value : 1 + (zoomLevel.value - 1) * 0.625,
  )

  return { zoomLevel, chromeZoom, loginZoom }
}
