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
// Every builder call is also recorded, so a test can assert *what* an endpoint
// wrote (`dbCalls()`), not only which branch it took. The recorded arguments
// are the plain objects the handler passed — `values({ sortOrder: 5 })`,
// `set({ name: 'x' })` — which is exactly the part the handler computes and
// SQL does not.
//
// Queue and recording are module-scoped; vitest isolates module state per test
// file, and `resetDb()` (call it in beforeEach) clears both.

const queue: unknown[] = []

export interface DbCall {
  method: string
  args: unknown[]
}

const calls: DbCall[] = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proxy: any = new Proxy(() => {}, {
  get(_target, prop) {
    if (prop === 'then') {
      const result = queue.length > 0 ? queue.shift() : []
      return async (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled)
    }
    return (...args: unknown[]) => {
      calls.push({ method: String(prop), args })
      return proxy
    }
  },
  apply() {
    return proxy
  },
})

function entry(method: string) {
  return (...args: unknown[]) => {
    calls.push({ method, args })
    return proxy
  }
}

export const mockDb = {
  select: entry('select'),
  insert: entry('insert'),
  update: entry('update'),
  delete: entry('delete'),
}

/** Queue the results returned by successive awaited DB queries, in order. */
export function queueDbResults(...results: unknown[]): void {
  queue.push(...results)
}

/** Every builder call since the last reset, in order. */
export function dbCalls(): DbCall[] {
  return calls
}

/** The arguments of the first `method` call, or undefined if there was none. */
export function firstDbCall(method: string): unknown[] | undefined {
  return calls.find((call) => call.method === method)?.args
}

/** Clear queued results and recorded calls. Call in `beforeEach`. */
export function resetDb(): void {
  queue.length = 0
  calls.length = 0
}
