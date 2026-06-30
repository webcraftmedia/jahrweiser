// A minimal mock for the Drizzle `useDb()` instance used by the server
// endpoints. Drizzle queries are chainable thenables — every builder method
// (`select`, `from`, `where`, `limit`, `insert`, `values`, `update`, `set`,
// `delete`, `leftJoin`, `groupBy`, `orderBy`, `onDuplicateKeyUpdate`, …) returns
// the same proxy, and awaiting the chain resolves to the next queued result.
//
// Tests script the results in the order the handler awaits its queries:
//   queueDbResults([userRow], [])   // 1st query -> [userRow], 2nd -> []
// This verifies control flow (branches, error paths), NOT the generated SQL —
// the full-stack e2e suite covers SQL correctness against real MariaDB.
//
// The queue is module-scoped; vitest isolates module state per test file, and
// `resetDb()` (call it in beforeEach) clears it between tests.

const queue: unknown[] = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proxy: any = new Proxy(() => {}, {
  get(_target, prop) {
    if (prop === 'then') {
      const result = queue.length > 0 ? queue.shift() : []
      return async (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled)
    }
    return () => proxy
  },
  apply() {
    return proxy
  },
})

export const mockDb = {
  select: () => proxy,
  insert: () => proxy,
  update: () => proxy,
  delete: () => proxy,
}

/** Queue the results returned by successive awaited DB queries, in order. */
export function queueDbResults(...results: unknown[]): void {
  queue.push(...results)
}

/** Clear any queued results. Call in `beforeEach`. */
export function resetDb(): void {
  queue.length = 0
}
