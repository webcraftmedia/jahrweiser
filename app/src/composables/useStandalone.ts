/**
 * Whether the app runs installed — started from the home screen, without the
 * browser's address bar, reload button or pull-to-refresh. Those then have to
 * come from the app itself (see useRefreshable).
 *
 * False during server rendering and until mount, so the first client render
 * matches the server's; the answer follows right after.
 */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS reports the home-screen app here instead.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function useStandalone() {
  const standalone = ref(false)
  onMounted(() => {
    standalone.value = isStandalone()
  })
  return standalone
}
