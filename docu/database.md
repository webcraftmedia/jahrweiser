# Database (auth sidecar)

The app uses a MariaDB sidecar for auth-related state: users, roles, login
tokens, sessions, admin tags, and the DAV sync token. DAV (Baikal) remains the
source of truth for contact data — anything the user pflegt themselves, plus
the X-ADMIN-TAGS that an admin manages via DAV clients. The sidecar holds what
the app writes automatically.

## What lives where

| Field                    | Store           | Notes                                     |
|--------------------------|-----------------|-------------------------------------------|
| name, phone, address     | DAV (CardDAV)   | User-edited, propagated via DAV-Client    |
| email (primary)          | DAV + mirror    | DAV authoritative, sidecar indexed copy   |
| postal code (`ADR`)      | DAV + mirror    | DAV authoritative; mirrored so the member map can `GROUP BY` (see `docu/karte.md`) |
| `role`                   | MariaDB         | Set via `cli:admin:grant`, never via DAV  |
| admin tags (categories)  | DAV + mirror    | DAV authoritative; sync overwrites sidecar |
| login tokens             | MariaDB         | One-time magic links                      |
| sessions                 | MariaDB         | DB-backed, revocable                      |
| sync state               | MariaDB         | Per-collection sync token + lock          |
| registration links       | MariaDB         | Admin-minted self-signup links            |
| link redemptions         | MariaDB         | Who joined via which link (+ count)       |
| telegram channels        | MariaDB         | Admin-edited invite list (see `docu/telegram-channels.md`) |
| daily metrics            | MariaDB         | One measured snapshot per day for /admin (see `docu/admin-dashboard.md`) |
| user events              | MariaDB         | Append-only audit trail per member, auto-expiring (see below) |

Self-registration still funnels contact data into DAV: a successful signup
writes the new VCard to DAV (source of truth) and mirrors it into the sidecar so
login works before the next sync. See `docu/registration-links.md`.

## The audit trail (`user_events`)

Every step of a member's contact with the system leaves one row: a login link
asked for, held back by the cooldown, refused, mailed or not mailed; a link
redeemed or rejected and why; a session invalidated; a newsletter delivered; a
profile edited; an admin changing somebody's calendars. Written by
`server/helpers/events.ts`, read by the member view in `/admin`.

It exists because the console could not answer the one question support keeps
asking — *why* could this person not log in — and because a log that rotates
cannot be read per member.

Three properties are deliberate:

- **Append-only.** Nothing updates a row except the retention sweep. An audit
  trail that can be edited answers no question worth asking.
- **Failing open.** `recordEvent` never lets a write error reach the caller: a
  busy audit table must not be what stops somebody logging in. It logs the loss
  to the console instead, so a hole in the trail is visible.
- **Expiring.** The truncated origin is blanked after **30 days**, the row
  itself dropped after **180** (`IP_RETENTION_DAYS` / `EVENT_RETENTION_DAYS`).
  The sweep rides along with the sync cron — see `docu/sync-crontab.md`.

Data minimisation, in the two places it matters:

- A login attempt for an address nobody here uses is recorded **without that
  address** (`user_uid` null). A table of non-members who once typed something
  into our form is a shadow list we have no business keeping.
- The origin is stored as a network, never as an address: IPv4 truncated to
  /24, IPv6 to /48. Behind a reverse proxy it comes from `X-Forwarded-For`,
  which a client can set — it is a diagnostic hint and must never become the
  basis for a decision.

## Local development

1. Copy `app/.env.example` to `app/.env` and adjust as needed. The
   defaults match the `docker-compose.yml` setup.

2. Start the stack:

   ```sh
   docker compose up -d
   ```

   This brings up MariaDB, Baikal (local DAV server), Maildev, the admin static
   server, and the app. Wait for healthchecks to go green:

   ```sh
   docker compose ps
   ```

3. Apply DB migrations (idempotent):

   ```sh
   cd app
   npm run db:migrate
   ```

4. Baikal is auto-provisioned by `infra/baikal/init-bootstrap.sh` on first
   start: the install wizard is skipped, the SQLite schema is initialized,
   and a DAV principal `admin` (password `admin`) with a default addressbook
   is created. The `baikal_data` named volume persists this — to start over,
   `docker compose down -v` and `docker compose up -d`.

5. Seed test data:

   ```sh
   npm run cli:seed:reset    # wipes both stores
   npm run cli:seed:demo     # creates test users + runs sync
   ```

## Environment variables

| Variable           | Default       | Purpose                                |
|--------------------|---------------|----------------------------------------|
| `DB_HOST`          | `localhost`   | `mariadb` inside docker-compose        |
| `DB_PORT`          | `3306`        | DB port                                |
| `DB_NAME`          | `jahrweiser`  | Database name                          |
| `DB_USER`          | `jahrweiser`  | Application user                       |
| `DB_PASSWORD`      | `jahrweiser`  | Application user password              |
| `DB_ROOT_PASSWORD` | `rootpw`      | Root password for bootstrapping        |
| `SYNC_SECRET`      | *(unset)*     | Bearer token for `/api/admin/sync-now` |

Production deployments must override `DB_PASSWORD`, `DB_ROOT_PASSWORD`, and
`SYNC_SECRET`.

## One-time DB bootstrap (production / fresh server)

For local dev the docker-compose `mariadb` service auto-creates the database
and user from env vars. On a managed MariaDB / a fresh server, run the
bootstrap script once:

```sh
DB_PASSWORD='strong-prod-secret' \
DB_ADMIN_USER=root \
  ./infra/db/setup.sh
```

This creates `jahrweiser` database and `jahrweiser@'%'` user (overridable via
`$DB_NAME`/`$DB_USER`). See `infra/db/setup.sql` for the canonical SQL — you
can also apply it manually with `envsubst` + `mysql` (or hand-edit the
placeholders).

## Schema and migrations

Schema lives in `app/server/db/schema/`. Each table is in its own file;
`index.ts` is the barrel.

```sh
cd app
npm run db:generate        # diffs schema vs last snapshot, writes SQL into server/db/migrations
npm run db:migrate         # applies pending SQL files
npm run db:studio          # opens drizzle-studio in the browser
```

## Production-guard

Destructive CLIs (`cli:admin:grant`, `cli:admin:revoke`, `cli:seed:reset`,
`cli:seed:demo`, `cli:sync:run`, `cli:dav:purge-auth-xprops`) call
`assertLocalEnv()` and refuse to run if `DAV_URL` or `DB_HOST` doesn't look
local. To run against production, set `ALLOW_PRODUCTION=1` explicitly:

```sh
ALLOW_PRODUCTION=1 npm run cli:admin:grant alice@example.com
```

## Connecting from app code

```ts
import { useDb } from '~~/server/db'

const db = useDb()
const rows = await db.select().from(users).where(eq(users.email, 'foo@bar.com'))
```

`useDb()` returns a singleton pool-backed Drizzle instance reading `DB_*` from
`process.env`. Works in both Nuxt server runtime and CLI scripts.
