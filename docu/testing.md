# Testing

Three layers of tests:

| Layer | Command | What it covers |
|---|---|---|
| Unit | `npm run test:unit` | Pure helpers, Vue components, server helpers without DB |
| E2E (mock) | `npm run test:e2e` | UI flows against mocked API responses (no backend needed) |
| E2E (full-stack) | `npm run test:e2e:full-stack` | Real app hitting real Baikal + MariaDB + Maildev |

## Unit tests

```sh
cd app
npm run test:unit
```

Coverage is enforced at 100% over `src/`, `server/api/`, `server/helpers/` and
`shared/`. The last one is measured because it holds the rules both sides depend
on (validation limits, the feedback contract, the calendar palette): an untested
branch there is one neither the client nor the server notices.

Four files are excluded — the bulk newsletter send
(`admin/send-newsletter.post.ts`), the rate-limited login request
(`requestLoginLink.post.ts`), the multi-path register flow (`register.post.ts`)
and the DAV→sidecar diff (`helpers/sync.ts`). They are validated by the
full-stack E2E suite, and `server/api/_smoke.spec.ts` guards them against
load-time errors. See `vitest.config.ts` for the list and the reasoning.

## E2E (mocked)

```sh
npm run test:e2e
```

Uses Playwright with `page.route` mocks. The Nuxt server is spawned from
`playwright.config.ts` with fake DAV credentials — no real backend dependency.

## E2E (full-stack)

Hits the real stack end-to-end. Useful for validating the auth-sidecar flow,
DAV sync, email delivery (via Maildev), and the cron endpoint.

### Setup

```sh
# 1. Bring the stack up
docker compose up -d

# 2. Apply DB migrations
cd app
npm run db:migrate

# 3. Baikal is auto-provisioned at first container start (see docu/database.md, step 4).
#    To force a clean re-provision: docker compose down -v && docker compose up -d

# 4. Run the app in dev with env vars pointing at the local stack
DAV_URL=http://localhost:8088/dav.php \
  DAV_USERNAME=admin \
  DAV_PASSWORD=admin \
  DB_HOST=localhost \
  SMTP_HOST=localhost \
  SMTP_PORT=1025 \
  SYNC_SECRET=test-sync-secret \
  npm run dev

# 5. In another shell: run the tests
SYNC_SECRET=test-sync-secret npm run test:e2e:full-stack
```

The tests call `cli:seed:reset` and `cli:seed:demo` in `beforeAll` so they're
self-provisioning. They wipe state between runs.

### Logging in

Every spec goes through `e2e-full-stack/helpers/session.ts` — `loginViaMagicLink`
for the usual case, `requestLoginLink` for the two tests that need the token
itself. It used to be a copy per spec, which meant a fix landed in one file and
nowhere else.

Two things live there for a reason:

- **`fillAndSubmit`** fills a form, presses the button and then checks that the
  expected request actually went out — retrying the pair if it did not. A dev
  server that is still re-optimizing dependencies re-renders the form and empties
  it, so a click a moment later submits nothing: client-side validation refuses,
  no request leaves the browser, and the test waits for a confirmation that will
  never come. Verifying only the typed value is not enough — the re-render can
  land between the check and the click, which is what both remaining flakes in
  this suite were (login and registration). Use it for every form here; the
  criterion is the request, so a slow server is not mistaken for a lost click.
- **`COLD_START_MS`** (default 30s, override with `E2E_COLD_START_MS`) is the
  budget for the first interaction of a run, when the route is compiled, the DAV
  connection opened and the pool warmed. A number to raise on a slow machine,
  instead of a retry. The suite's per-test timeout (`playwright.full-stack.config.ts`)
  is deliberately larger than it.

### Maildev

Maildev's HTTP API on port 1080 lets the tests fetch sent emails programmatically
and extract login tokens. UI for manual inspection at <http://localhost:1080>.

### What's covered

- Seeded user can log in via magic link
- Unknown emails do not leak existence (and do not produce mail)
- Token re-use is rejected with 401
- Admin can reach `/admin`
- Login-link rate limit silently blocks repeated requests
- `/api/admin/sync-now` requires a valid Bearer token
- Weekly newsletter reaches its subscribers (`newsletter.spec.ts`)
- Feedback, bug report and event suggestion arrive as mail in the team inbox,
  with the member's wording and without the data they did not send
  (`feedback.spec.ts`)

### What's NOT covered (yet)

- Soft-delete blocking login after DAV-side delete
- Email change in DAV invalidating active sessions
