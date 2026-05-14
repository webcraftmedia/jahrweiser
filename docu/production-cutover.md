# Production Cutover: DAV-only → DAV + MariaDB sidecar

This playbook moves an existing production deployment (where auth state lives
in DAV X-properties) to the new architecture (sidecar in MariaDB). Plan a
maintenance window — at the very least for the database migration and the
final purge step. The intermediate steps are zero-downtime.

## Order of operations

### Phase 1 — Stand up the sidecar (no behavior change)

1. Provision MariaDB next to the app. Create the application database and
   user (one-time, idempotent):

   ```sh
   DB_PASSWORD='strong-prod-secret' \
   DB_HOST=db.internal \
   DB_ADMIN_USER=root \
     ./infra/db/setup.sh
   ```

   This creates database `jahrweiser` (or `$DB_NAME`) and user
   `jahrweiser@'%'` (or `$DB_USER`) with full privileges on it. See
   `infra/db/setup.sql` for the canonical SQL.

2. Set `DB_HOST/PORT/USER/PASSWORD/NAME` and `SYNC_SECRET` in the deployment
   environment (e.g., `frontend/.env` on the prod box). `SYNC_SECRET` should
   be a freshly generated random string; pin it in the crontab environment too.
3. Deploy the new app version. **Do not** schedule the crontab yet.
4. Migrations run automatically on deploy via `.github/webhooks/deploy.sh`.
   For a manual run: `cd frontend && npm run db:migrate`.

At this point the new code runs but the sidecar is empty. Login still falls
through to DAV via the lazy-fallback path; it works exactly like before, just
with one extra MariaDB roundtrip on first login per user.

### Phase 2 — Initial backfill

5. Run the sync manually once:

   ```sh
   ALLOW_PRODUCTION=1 curl -X POST -H "Authorization: Bearer $SYNC_SECRET" \
     https://app.example.com/api/admin/sync-now
   ```

   This populates the sidecar with every existing DAV user, including their
   role (read from `X_ROLE`) and admin tags (from `X_ADMIN_TAGS`). Verify the
   counts in the response.

6. Spot-check: log into the admin DB studio (`npm run db:studio`) and confirm
   user counts and a few known admins look right.

### Phase 3 — Enable the crontab

7. Add the daily cron entry per `sync-crontab.md`.
8. Watch the log for a few days. Verify counts are stable.

### Phase 4 — Purge legacy X-properties from DAV

This is the one-way step. After it runs, role lives only in MariaDB. If the
sidecar is wiped after this point, admin status is lost.

9. Backup DAV first (Baikal `Specific/db/db.sqlite` for SQLite installs, or
   `mysqldump` for MySQL installs).
10. Run the purge:

    ```sh
    ALLOW_PRODUCTION=1 npm run cli:dav:purge-auth-xprops
    ```

    This removes `X_LOGIN_TOKEN`, `X_LOGIN_REQUEST_TIME`, `X_LOGIN_TIME`,
    `X_LOGIN_DISABLED`, and `X_ROLE` from every VCard. `X_ADMIN_TAGS` is kept
    (dual-store).

11. Spot-check VCards in Thunderbird/Apple Cal: they should be smaller, and no
    auth fields visible.

### Phase 5 — Validation

12. Test login flow as a regular user.
13. Test login as an admin; verify admin-only pages work.
14. Test that an active session survives a sync run.
15. Test that an email change in DAV invalidates the session at the next sync.

## Rollback

- **Before phase 4**: roll back the app deployment. The X-properties are still
  in place, so the old code keeps working.
- **After phase 4**: rollback is harder. You'd need to either restore the DAV
  backup or run a reverse migration that copies role+tags out of MariaDB into
  X-properties on each VCard. That CLI is not in the repo yet — write it from
  the existing `cli/dav-purge-auth-xprops.ts` template if you ever need it.

## Things that surprise people

- After the purge, **resetting the sidecar requires re-granting admin** via the
  CLI. There is no automatic backfill of roles from DAV anymore.
- The crontab `SYNC_SECRET` must match the running app's `SYNC_SECRET`. If you
  rotate one, rotate both.
- The lazy-fallback on first login means a fresh user added in Thunderbird can
  log in immediately — they don't have to wait for the next nightly sync.
