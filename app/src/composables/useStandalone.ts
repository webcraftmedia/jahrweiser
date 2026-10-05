import { deviceEnv, isStandalone } from '~/utils/device'

/**
 * Whether the app runs installed — started from the home screen, without the
 * browser's address bar, reload button or pull-to-refresh. Those then have to
 * come from the app itself (see useRefreshable). The rule itself lives with the
 * other device heuristics in src/utils/device.ts.
 *
 * False during server rendering and until mount, so the first client render
 * matches the server's; the answer follows right after.
 */
export function useStandalone() {
  const standalone = ref(false)
  onMounted(() => {
    standalone.value = isStandalone(deviceEnv())
  })
  return standalone
}
