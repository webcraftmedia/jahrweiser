/**
 * A deadline for a database query.
 *
 * mysql2's pool has no acquire timeout: with `waitForConnections: true` a query
 * that finds all connections busy queues *indefinitely*. Busy includes "held by
 * a socket the kernel has not given up on yet", which is what a database
 * restart or a network blip leaves behind — so a single hiccup turns every
 * later request into one that never answers. The browser has no timeout for
 * that either, which is how an endless loading state reaches a member.
 *
 * 503 rather than 500: the request was fine, the dependency was not, and that
 * is the difference between "try again in a moment" and "this is broken".
 */
export const DB_TIMEOUT_MS = 8_000

export async function withDbTimeout<T>(query: PromiseLike<T>, ms = DB_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      query,
      // eslint-disable-next-line promise/avoid-new -- ein Timer wird nur so zum Promise; es gibt hier nichts zu verketten
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(createError({ statusCode: 503, statusMessage: 'Database unavailable' }))
        }, ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
