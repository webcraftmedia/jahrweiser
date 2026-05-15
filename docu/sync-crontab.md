# Daily DAV → Sidecar Sync (Crontab)

DAV remains the source of truth for contact data. The MariaDB sidecar holds
auth state and a mirror of relevant DAV fields (email, display name, admin
tags). They are reconciled once per day by an HTTP POST to:

```
POST /api/admin/sync-now
Authorization: Bearer $SYNC_SECRET
```

The endpoint:

- Acquires an idempotency lock via the `sync_state` table (10-minute staleness).
- Fetches all VCards from DAV.
- Upserts users, mirrors display name + admin tags, soft-deletes missing users,
  invalidates sessions on email change.
- Returns JSON: `{added, updated, deleted, emailChanges, durationMs, skippedLocked}`.

## Host crontab example (Alpine)

```cron
# /etc/crontabs/root  — apply with `crontab /etc/crontabs/root` or via openrc
0 3 * * * curl -sS -X POST -H "Authorization: Bearer $SYNC_SECRET" \
  https://app.example.com/api/admin/sync-now >> /var/log/jahrweiser-sync.log 2>&1
```

`SYNC_SECRET` must be defined in the environment of the cron job. The
recommended pattern is to source a file:

```sh
# /etc/jahrweiser-sync.env
SYNC_SECRET=<long-random-token>
```

```cron
0 3 * * * . /etc/jahrweiser-sync.env && curl -sS -X POST \
  -H "Authorization: Bearer $SYNC_SECRET" \
  https://app.example.com/api/admin/sync-now \
  >> /var/log/jahrweiser-sync.log 2>&1
```

## Manual trigger

The same endpoint serves as a manual "sync now" button — useful when an admin
just deleted a user in Thunderbird and wants the change to propagate
immediately instead of waiting for the next cron run.

```sh
curl -X POST -H "Authorization: Bearer $SYNC_SECRET" \
  http://localhost:3000/api/admin/sync-now
```

## Errors

| HTTP status | Meaning |
|---|---|
| 200 | Sync completed (check JSON for counts; `skippedLocked: true` means another run was in flight) |
| 401 | Wrong / missing Bearer token |
| 503 | `SYNC_SECRET` is not configured server-side |
| 5xx | DAV unreachable or DB error — see app logs |

## Generating SYNC_SECRET

```sh
openssl rand -hex 32
```
