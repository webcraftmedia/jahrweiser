# Telegram channels

The invitations members see at `/telegram`, administered at `/admin/telegram`
(Admin → Telegram-Kanäle).

Every admin may add, edit, reorder and delete a channel: the list is the
community's shared configuration, not the property of whoever typed it in. Who
added a channel is recorded all the same — a private invite link is a
permission, and its origin is worth knowing.

## Why the database, not the JSON file it used to be

Up to and including 1.11 the list lived in a git-ignored
`data/telegram-channels.json`, hand-edited on the server. That was the right
shape while only a person with shell access wrote it. Once the app writes it,
the same file brings four problems the sidecar database has already solved:

- **Atomic writes.** A crash or a full disk mid-write leaves a truncated file;
  the endpoint then answers 500 and the section disappears for everybody.
- **Lost updates.** The list is written as a whole, so two admins editing at the
  same time do not mean "last one wins" — the other's changes are gone entirely,
  without a trace.
- **No audit.** Nobody could tell afterwards who added or removed which private
  invite link.
- **Write access.** The deployment directory would have to be writable; the
  Blättchen archive next door gets by with read-only.

The dependency costs nothing: without MariaDB nobody can log in, and the channel
list sits behind the login anyway.

## Migrating an existing deployment

1. Deploy and run the migrations (`npm run db:migrate`) — this adds
   `telegram_channels`.
2. Import the old file **once**:

   ```sh
   npm run cli:telegram:import              # data/telegram-channels.json
   npm run cli:telegram:import -- /pfad/zur/datei.json
   ```

   Run it from `frontend/`, so the CLI finds the `.env` next to it — on
   production the DB connection goes through `DB_SOCKET`, and without those
   values the run falls back to TCP `localhost:3306` and dies with
   `ECONNREFUSED`. The first output line names the database it is writing to.

   The import only ever adds and skips channels whose URL is already in the
   table, so an interrupted run can simply be repeated. File order becomes list
   order.
3. Check `/admin/telegram`, then delete the JSON file — nothing reads it any
   more. `TELEGRAM_CHANNELS_FILE` is gone from the runtime config; the import
   CLI still honours it as a default path.

## Ordering

`sort_order` is a dense `0..n-1` sequence, edited with the ↑/↓ buttons in the
admin list. Every move rewrites the whole sequence, which also closes the gaps a
deletion leaves and the duplicates an import can produce. The client only ever
sends "this channel, that direction" — never the whole order — so a stale page
cannot overwrite what somebody else just rearranged.

## Endpoints

| Endpoint | Answer |
| --- | --- |
| `GET /api/telegram-channels` | `[{ id, name, description?, url, public }]`, in list order |
| `POST /api/admin/telegram-channels/create` | `{ name, description?, url, public? }` → `{}` |
| `POST /api/admin/telegram-channels/update` | `{ id, name, description?, url, public? }` → `{}` or 404 |
| `POST /api/admin/telegram-channels/move` | `{ id, direction: 'up' \| 'down' }` → `{}` or 404 |
| `POST /api/admin/telegram-channels/delete` | `{ id }` → `{}` or 404 |

All of them require a session; everything under `/admin/` additionally requires
the admin role. The read endpoint is behind the login on purpose — a private
invite link *is* the permission, so it must not reach an anonymous visitor
through the client bundle.

Every URL has to start with `https://t.me/`, checked with the same function on
the server and in the form (`shared/telegram.ts`). That keeps a typo from
turning the channel list into an open-redirect surface.

## Backup

`telegram_channels` is part of `CORE_TABLES` in `cli/backup.ts`, so
`npm run cli:backup` includes it. A restore brings the channel list back with
everything else.
