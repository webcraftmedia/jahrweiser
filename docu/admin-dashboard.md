# Admin overview (/admin)

Six current numbers as tiles — members, members the map can place, newsletter
subscribers, people who opted out, Telegram channels, Blättchen issues — plus a
twelve-month curve for the two that move: membership and the newsletter.

## What is measured, and what is reconstructed

Measuring only started when this shipped, so the twelve-month window reaches
back into a time nobody was recording. Everything before the first daily
snapshot is therefore **reconstructed from the user rows** and drawn dashed,
with a note on the card. Both reconstructions are biased in a knowable
direction, and both biases fade as the curve approaches today.

**Members** come from `created_at` and `deleted_at`. The catch is that
`created_at` is when the sidecar first *saw* somebody through the DAV sync, not
when they joined: everybody who was already there at the cutover shares one
date, so the dashed span shows a step that was never an influx.

**The newsletter split** comes from the current state plus `updated_at`. That
works because nothing touches an unsubscribed user's row on a schedule:

- the sync writes only when the name, address or deleted flag really changed
  (`server/helpers/sync.ts` — the `emailChanged || nameChanged || wasDeleted`
  guard), so a ten-minute cron does not restamp every row;
- the weekly send stamps `newsletter_last_sent_at` on its **recipients**, who
  are by definition the subscribed ones.

So for somebody who is unsubscribed today, `updated_at` is normally the moment
they opted out. Subscribers need no separate reconstruction: an account starts
out subscribed, so subscribers are everyone present minus those who opted out.

Its two limits, both understating the past:

- **Upper bound.** A later name or email change moves the date forward, so the
  opt-out looks more recent than it was.
- **Churn is invisible.** Somebody who opted out and later re-subscribed reads
  as "subscribed" and nothing remembers the detour, so the older part of the
  curve shows too few opt-outs.

Once a month has a snapshot, the measurement replaces the reconstruction and
the line turns solid.

**Postal codes have no reconstruction at all** — and that is a third case, not
a weaker version of the two above. `users.postal_code` was backfilled from DAV
in a single sync run, so `updated_at` says when the mirror was written, not when
somebody entered their code. There is no biased-but-usable inference to fall
back on, so `metrics_daily.with_postal_code` is nullable and the series carries
`null` for every month before the measurement: the line simply starts where the
measurements start, and the card says so. Rows written before the metric existed
keep that `null` too, which is why the column is nullable rather than
`NOT NULL DEFAULT 0` — a zero would read as "nobody had a postal code".

The **running month is the exception**: it is counted live when the dashboard
asks, not taken from a snapshot. The other series get their current month from
the derivation, which is exact for the present; the postal-code count has no
derivation, so without this the newest point would sit empty until the next
sync — and on an installation whose cron never fires (any dev machine) it would
sit empty for good, right underneath a tile showing the number.

What counts is the **map's** definition, not "the column is filled": five digits
that the geometry actually knows. A code the map cannot place puts nobody on it,
`/api/map/status` already refuses for it, and the same aggregate
(`GROUP BY postal_code`) feeds both — so the tile and the map's `located` cannot
drift apart. Without the geometry artefact the count falls back to the format
check, the same fallback the status endpoint makes.

## Where the numbers come from

`metrics_daily` holds one row per day: members, members with a usable postal
code, newsletter subscribed and unsubscribed, Telegram channels, Blättchen
issues.

It is written at the end of every **sync run** — the cron already hits
`POST /api/admin/sync-now` every ten minutes, and the row is keyed by the day
(`INSERT … ON DUPLICATE KEY UPDATE`), so the day's row is written once and then
overwritten. No second schedule, no event log. A failed measurement is logged
and swallowed: it must never make a cron run look like a failed sync.

`GET /api/admin/metrics` (admin-only) merges the two sources: measured values
where a snapshot exists for that month, the derivation before that, and `null`
wherever neither exists — which for the postal-code figure means every month
without a snapshot, since it has no derivation.

## The charts

Hand-drawn inline SVG, no charting library — the bundle is measured against a
220 kB budget and a chart library would eat most of the remaining headroom.

Membership and newsletter are **separate charts on purpose**: they are
different measures, and putting them on one plot would need a second y-axis,
which is the single most misleading thing a chart can do.

Postal-code coverage, by the same argument, belongs **in** the member chart: it
is a subset of the member count, measured in the same unit and on the same
scale, so one y-axis carries both — and the gap between the two lines is the
open address work, which is the thing an operator actually wants to see.

Series colours were validated with the dataviz palette checker against both
surfaces (worst adjacent colour-vision ΔE 13.7 light / 13.8 dark):

| Series | Light | Dark |
| --- | --- | --- |
| Members / opted out | `sienna #c2410c` | `sienna-light #ea580c` |
| Subscribers / with postal code | `craft #0d9488` | `craft #0d9488` |

Green against orange was the obvious first choice and was rejected: under
deuteranopia the pair collapses to ΔE 1.7 — indistinguishable.

Every chart carries the same numbers as a screen-reader-only table, a legend
whenever two series share a plot, and a direct label on each line's last point,
so a value can be read without hovering.
