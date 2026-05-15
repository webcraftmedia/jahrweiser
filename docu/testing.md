# Testing

Three layers of tests:

| Layer | Command | What it covers |
|---|---|---|
| Unit | `npm run test:unit` | Pure helpers, Vue components, server helpers without DB |
| E2E (mock) | `npm run test:e2e` | UI flows against mocked API responses (no backend needed) |
| E2E (full-stack) | `npm run test:e2e:full-stack` | Real frontend hitting real Baikal + MariaDB + Maildev |

## Unit tests

```sh
cd frontend
npm run test:unit
```

Coverage is enforced at 100%. The DB-integrated auth endpoints
(`requestLoginLink`, `redeemLoginLink`, `admin/sync-now`) and the DB
orchestration in `helpers/sync.ts` are excluded from coverage — they are
validated by the full-stack E2E suite instead. See `vitest.config.ts`.

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
cd frontend
npm run db:migrate

# 3. Baikal is auto-provisioned at first container start (see docu/database.md, step 4).
#    To force a clean re-provision: docker compose down -v && docker compose up -d

# 4. Run the frontend in dev with env vars pointing at the local stack
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

### What's NOT covered (yet)

- Soft-delete blocking login after DAV-side delete
- Email change in DAV invalidating active sessions
- Newsletter flow (future PR)
