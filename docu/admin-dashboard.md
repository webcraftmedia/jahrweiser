# Admin overview (/admin)

Five current numbers as tiles — members, newsletter subscribers, people who
opted out, Telegram channels, Blättchen issues — plus a twelve-month curve for
the two that move: membership and the newsletter.

## What can be known, and what cannot

This is the part worth understanding before reading the charts.

- **Newsletter history does not exist retroactively.**
  `users.newsletter_subscribed` is a *state*, not a history, and `updated_at`
  moves on every change (email, display name, soft delete, sync). Nothing in
  the schema can answer "when did somebody unsubscribe". The curve therefore
  starts on the day this shipped and fills up from there; until the first
  snapshot exists the card says so instead of drawing a line from zero.
- **The member curve is measured going forward and inferred backwards.**
  `users.created_at` is when the sidecar first *saw* a person through the DAV
  sync, not when they joined. Everybody who was already there at the cutover
  shares that one date, so the inferred span shows a step that was never an
  influx. That span is drawn **dashed** and the card says why. `deleted_at`
  gives real departures, and self-registrations carry a real date in
  `registration_link_redemptions`.

## Where the numbers come from

`metrics_daily` holds one row per day: members, newsletter subscribed and
unsubscribed, Telegram channels, Blättchen issues.

It is written at the end of every **sync run** — the cron already hits
`POST /api/admin/sync-now` every ten minutes, and the row is keyed by the day
(`INSERT … ON DUPLICATE KEY UPDATE`), so the day's row is written once and then
overwritten. No second schedule, no event log. A failed measurement is logged
and swallowed: it must never make a cron run look like a failed sync.

`GET /api/admin/metrics` (admin-only) merges the two sources: measured values
where a snapshot exists for that month, the derivation before that, and `null`
for newsletter months that were never measured.

## The charts

Hand-drawn inline SVG, no charting library — the bundle is measured against a
220 kB budget and a chart library would eat most of the remaining headroom.

Membership and newsletter are **separate charts on purpose**: they are
different measures, and putting them on one plot would need a second y-axis,
which is the single most misleading thing a chart can do.

Series colours were validated with the dataviz palette checker against both
surfaces (worst adjacent colour-vision ΔE 13.7 light / 13.8 dark):

| Series | Light | Dark |
| --- | --- | --- |
| Members / opted out | `sienna #c2410c` | `sienna-light #ea580c` |
| Subscribers | `craft #0d9488` | `craft #0d9488` |

Green against orange was the obvious first choice and was rejected: under
deuteranopia the pair collapses to ΔE 1.7 — indistinguishable.

Every chart carries the same numbers as a screen-reader-only table, a legend
whenever two series share a plot, and a direct label on each line's last point,
so a value can be read without hovering.
