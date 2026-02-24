const STORAGE_KEY = 'jahrweiser-dark'

const isDark = ref(false)
let initialized = false

function apply(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
}

function toggle() {
  isDark.value = !isDark.value
  apply(isDark.value)
  localStorage.setItem(STORAGE_KEY, String(isDark.value))
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
