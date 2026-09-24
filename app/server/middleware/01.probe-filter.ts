/**
 * Answer vulnerability scanners before they reach the renderer.
 *
 * A public host gets a steady stream of requests for `/wp-admin/…`, `/.env`,
 * `/cgi-bin/…` and friends. None of them match a route, so Nuxt renders the
 * error page for each — server-side Vue, i18n, the lot — and vue-router logs a
 * multi-line warning per attempt. The result is a log in which a real incident
 * is invisible (the last login report came with 800 lines of `wlwmanifest.xml`
 * and nothing else), plus a steady CPU cost for nobody's benefit.
 *
 * A flat 404 from here costs a regex. It is not a security measure — there is
 * nothing behind those paths to protect — it keeps the log readable, which is
 * what makes the *next* report diagnosable.
 *
 * Runs before `session-check` by filename order, so a probe never touches the
 * database either.
 */

/**
 * Three shapes, none of which the app itself ever serves:
 *  1. well-known scanner directories,
 *  2. server-side script extensions (this is a Node app — there is no PHP),
 *  3. dotfiles, except `/.well-known/` (ACME, apple-app-site-association).
 *
 * Matched against `event.path`, which carries the query string too — probes
 * like `?apis=../../.env` hide their payload there.
 */
const PROBE_PATH =
  /(?:^|\/)(?:wp-admin|wp-content|wp-includes|wp-json|xmlrpc\.php|cgi-bin|vendor|@fs)(?:\/|$)|\.(?:php|phtml|asp|aspx|jsp|cgi|env)(?:$|[?/])|(?:^|\/)\.(?!well-known(?:$|\/))[^/?]/i

export default defineEventHandler((event) => {
  if (!PROBE_PATH.test(event.path)) return

  // Plain assignment rather than `setResponseStatus`: h3 is not a direct
  // dependency of this app, so the helper is only reachable via the auto-import
  // layer, and this is one line either way.
  event.node.res.statusCode = 404
  // Returning a value ends the request here — nothing downstream runs.
  return 'Not Found'
})
