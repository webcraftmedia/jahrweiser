/**
 * Pull the calendar down at its top to refresh it — the gesture a browser
 * would offer, for the installed app, which has none (see useRefreshable).
 *
 * Deliberately narrow, because several things on the calendar already react
 * to touch:
 *
 * - only when the page is scrolled to its very top, so scrolling up through
 *   a long list never turns into a refresh;
 * - only while the movement is mostly vertical, so the sideways swipe that
 *   changes the month stays what it is;
 * - passive listeners only: the browser's own scrolling is never held up or
 *   cancelled, the indicator merely follows the finger.
 *
 * The caller decides where it applies; the calendar wires it to its wrapper
 * in the installed app only.
 */

/** How far (after damping) the finger has to pull before letting go refreshes. */
export const PULL_THRESHOLD_PX = 64

/** How far the indicator follows at most. */
const PULL_MAX_PX = 96

/** The finger moves the indicator by half: a pull should feel like resistance. */
const DAMPING = 0.5

/** The element that scrolls the page — `.content` in the default layout. */
function scrollTopOf(el: Element): number {
  return (el.closest('.content') ?? document.documentElement).scrollTop
}

export function usePullToRefresh(enabled: Ref<boolean>) {
  const refreshing = useRefreshing()
  /** How far the indicator is pulled down, in px. */
  const pull = ref(0)
  const armed = computed(() => pull.value >= PULL_THRESHOLD_PX)

  let start: { x: number; y: number } | null = null

  function onTouchStart(event: TouchEvent): void {
    start = null
    if (!enabled.value || refreshing.value || event.touches.length !== 1) return
    if (scrollTopOf(event.currentTarget as Element) > 0) return
    const touch = event.touches[0]!
    start = { x: touch.clientX, y: touch.clientY }
  }

  function onTouchMove(event: TouchEvent): void {
    if (!start) return
    const touch = event.touches[0]!
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    // Sideways or upwards: not a pull — give the gesture back for good.
    if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
      start = null
      pull.value = 0
      return
    }
    pull.value = Math.min(dy * DAMPING, PULL_MAX_PX)
  }

  function onTouchEnd(): void {
    const release = armed.value
    start = null
    pull.value = 0
    if (release) void refreshAll()
  }

  return { pull, armed, onTouchStart, onTouchMove, onTouchEnd }
}
