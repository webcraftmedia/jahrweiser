/**
 * A deadline for a request that must not be allowed to hang.
 *
 * `fetch` has no timeout of its own: a request whose connection stalls — a
 * server that accepted the socket and never answers, a phone that loses the
 * network mid-flight — leaves its promise pending forever. Any UI that renders
 * "loading" until that promise settles then renders it until the tab is closed.
 * That is exactly how a member ended up staring at three dots on the login
 * page with no way forward.
 *
 * So the deadline lives here rather than in the fetch options: `run` is handed
 * an AbortSignal to cancel the request, but the state machine does not depend
 * on the client honouring it — the race rejects either way.
 *
 * `AbortSignal.timeout()` would be the shorter spelling and is deliberately not
 * used: it is missing on the older iOS Safari versions still in the field, and
 * this is the one page where a member who cannot log in also cannot report that
 * they cannot log in.
 */

/** Thrown when the deadline passes before the request settles. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

export async function withTimeout<T>(
  ms: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    // Both sides are raced, so a late rejection from either is still handled
    // and cannot surface as an unhandled rejection.
    return await Promise.race([
      run(controller.signal),
      // eslint-disable-next-line promise/avoid-new -- ein Timer wird nur so zum Promise; es gibt hier nichts zu verketten
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new TimeoutError(ms))
        }, ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
