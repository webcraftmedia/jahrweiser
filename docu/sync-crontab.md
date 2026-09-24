# DAV → Sidecar Sync (Crontab)

DAV remains the source of truth for contact data. The MariaDB sidecar holds
auth state and a mirror of relevant DAV fields (email, display name, admin
tags). They are reconciled every 10 minutes by an HTTP POST to:

```
POST /api/admin/sync-now
Authorization: Bearer $SYNC_SECRET
```

The endpoint:

- Acquires an idempotency lock via the `sync_state` table (10-minute staleness).
- Fetches all VCards from DAV.
- Upserts users, mirrors display name + admin tags, soft-deletes missing users,
  invalidates sessions on email change.
- Records the daily metrics snapshot (see `docu/admin-dashboard.md`). This runs
  **even when the sync itself failed** — it reads the sidecar, which is fine
  while DAV is unreachable — so a broken DAV no longer takes the dashboard
  series down with it.
- Sweeps the audit trail: blanks the origin on events older than 30 days,
  deletes events older than 180 (see `docu/database.md`). Runs on the same terms
  as the metrics — a deletion obligation does not pause because DAV is offline,
  and a failed sweep is logged rather than reported as a failed sync. Quiet when
  there was nothing to forget; otherwise one `[events] pruned …` line.
- Returns JSON:
  `{added, updated, deleted, emailChanges, tagFailures, durationMs, skippedLocked}`.

`tagFailures > 0` means a contact's admin tags could not be mirrored. The sync
deliberately carries on past that — the tags are a convenience, the member data
is not — so this counter is the only place it surfaces. Details are in the app
log (`pm2 logs`), prefixed `[sync] failed to mirror tags for`.

`sync_state.last_synced_at` records the last *successful* run. A run that threw
releases the lock but does not move the timestamp, so a sync that has been
failing for days is visible there:

```sql
SELECT collection_url, last_synced_at, running_since FROM sync_state;
```

## Host crontab example (Alpine)

```cron
# /etc/crontabs/root  — apply with `crontab /etc/crontabs/root` or via openrc
*/10 * * * * curl -sS -X POST -H "Authorization: Bearer $SYNC_SECRET" \
  https://app.example.com/api/admin/sync-now >> /var/log/jahrweiser-sync.log 2>&1
```

`SYNC_SECRET` must be defined in the environment of the cron job. The
recommended pattern is to source a file:

```sh
# /etc/jahrweiser-sync.env
SYNC_SECRET=<long-random-token>
```

```cron
*/10 * * * * . /etc/jahrweiser-sync.env && { date -Is; curl -sS --fail -X POST -H "Authorization: Bearer $SYNC_SECRET" https://app.example.com/api/admin/sync-now; echo; } >> /var/log/jahrweiser-sync.log 2>&1
```

`--fail` and the redirection are not cosmetic. Without them a failing run is
completely silent: `curl` prints the error body to stdout, cron mails stdout,
and a host without an MTA drops the mail. That is how a sync returning 500
every ten minutes went unnoticed for five days. `date -Is` makes the log
readable as a history rather than a pile of JSON.

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

## Related: Weekly newsletter cron

The weekly newsletter (see `docu/newsletter.md`) is dispatched by a separate
cron entry on Sundays at 18:00, using the same `SYNC_SECRET`:

```cron
0 18 * * 0 . /etc/jahrweiser-sync.env && curl -sS -X POST \
  -H "Authorization: Bearer $SYNC_SECRET" \
  https://app.example.com/api/admin/send-newsletter \
  >> /var/log/jahrweiser-newsletter.log 2>&1
```
