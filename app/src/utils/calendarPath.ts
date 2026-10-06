/**
 * The calendar owns `/` plus the dated permalinks it pushes into the URL
 * (/2026/09, /2026/09/event/<id>) — see the route pattern in pages/index.vue.
 * The pattern stays deliberately flat — a single bounded `\d{4}` followed by
 * a separator — so there is nothing for a backtracking engine to chew on.
 */
export function isCalendarPath(path: string): boolean {
  return path === '/' || /^\/\d{4}(\/|$)/.test(path)
}
