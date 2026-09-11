# Member map

Where the community lives, at `/karte`: one number per postal code, drawn on the
German postal-code areas. No names, no addresses, no single member's location —
the map only ever shows counts.

Reachable from the icon rail like the calendar, the Blättchen and the Telegram
channels — and, on a phone, from the burger menu as well: the rail is a row of
unlabelled icons at the bottom edge, and whoever does not read that as
navigation looks in the menu. Both render the same list, from
`src/composables/useAppSections.ts`; only the rail fetches, because the header
renders on the login page too and a request from a signed-out visitor is a 401.

Unlike Blättchen and Telegram, the map entry is **always** there: the map exists
for every member, it just cannot show anything until they have given a postal
code the map can place. Until then the rail marks the entry with a warning dot
and the page shows a blurred preview with an invented data set.

## The gate

`GET /api/map/members` refuses with **403 `postal-code-required`** for a member
the map cannot place, and sends **nothing** — no areas, no counts.

"Cannot place" is `lookupPostalCode()` in `server/helpers/memberMap.ts`: five
digits that the geometry actually knows. Not "is the column filled" — a code
nobody can draw buys no more of the aggregate than an empty one, and
`GET /api/map/status` answers the same question so the rail's marker cannot
clear itself for a member who still sees nothing.

That is deliberate. The blurred preview the page shows in that state is
generated on the client (`src/utils/mapPreview.ts`) from a fixed list of
made-up numbers. Sending the real aggregate and blurring it in CSS would hand
it to anyone who opens the network tab; the blur is a visual invitation, not a
protection mechanism.

The preview is also `aria-hidden` and has no data table. Offering invented
numbers to a screen reader would be a lie, not an accommodation.

Members who have no postal code but want the map need do only one thing:
Einstellungen → Profil → Postleitzahl. The write goes to DAV first (the source
of truth) and is mirrored into the sidecar in the same request, so the map
unlocks immediately rather than after the next sync — including the rail's
marker, which the form sets directly instead of asking `/api/map/status` again.

## What counts as a postal code

The same geometry the map draws from. `POST /api/me/profile` refuses anything
else with **400 `invalid-postal-code`**, before it touches DAV, and stores the
normalised five digits rather than what was typed — so "D-64673" and "64 673"
cannot come back as two spellings of one place.

Validating against a regex was the obvious alternative and is not enough: five
digits that are not a German postal code (a transposed pair, a house number)
pass every format check and then put the member nowhere. The map is the only
thing in the app that consumes this field, so the map's own data is the
authority for it. The price is that a foreign postal code can no longer be
entered in the settings; one already in DAV still syncs in, and the map reports
it under `unlocated` as before.

While the member types, `GET /api/map/postal-code?plz=…` answers
`{ known, plz, ort }` for the same lookup, so the form can confirm the town
("64625 — Bensheim") rather than only refuse what is wrong. It is a lookup, not
a resource: an unknown code is a 200 with `known: false`. A **failed** lookup —
the endpoint down, no artefact — leaves saving possible; the endpoint that
stores the value validates it regardless, and a flaky request must not lock a
member out of their own name.

Without the artefact there is nothing to validate against and both endpoints
fall back to the format. A deployment that has never run `npm run map:build` has
no map; it must not also have an unusable profile form.

## Where the postal code lives

DAV remains the source of truth: the code sits in the vCard's `ADR` property,
component 5, exactly as before. `users.postal_code` in the sidecar is a
**mirror**, kept current from two directions:

- `POST /api/me/profile` writes DAV, then the mirror (write-through).
- `syncDavToSidecar` reads `ADR` on insert _and_ on update — unlike `role`,
  which is sidecar-authoritative, an empty `ADR` means "cleared in a DAV client"
  and has to overwrite the mirror.

The mirror exists so the aggregate is a `GROUP BY` over a few hundred rows
instead of a full scan of the DAV address book on every request. It carries no
index: at association scale the grouping is cheaper than maintaining one.

A postal code entered in a DAV client rather than in the settings reaches the
mirror with the next sync — every ten minutes in production (see
`docu/sync-crontab.md`), and until then the rail keeps its marker.

## Endpoints

| Endpoint                   | Answers                                                                        | Gate                              |
| -------------------------- | ------------------------------------------------------------------------------ | --------------------------------- |
| `GET /api/map/status`      | `{ hasPostalCode }` — can the map place _you_; asked by the rail on every page | session                           |
| `GET /api/map/outline`     | the country silhouette **and the coordinate system**                           | session                           |
| `GET /api/map/members`     | the aggregate: one entry per postal code, with its shape                       | session + a placeable postal code |
| `GET /api/map/places`      | the most important towns inside a rectangle, for the labels                    | session                           |
| `GET /api/map/postal-code` | `{ known, plz, ort }` — what the settings form checks against                  | session                           |

## The artefacts

Both are generated by `scripts/build-map-data.ts` and **committed**. The app
never fetches geodata at build or run time.

| File                               | Holds                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `server/assets/map/plz-areas.json` | the viewBox, the country silhouette, and all ~8.200 postal-code shapes |
| `server/assets/map/places.json`    | ~80.000 towns, villages and Stadtteile with a rank                     |

Both are server-side only, read through `useStorage('assets:server')`. The
endpoints send the client only what a view needs — a few dozen areas, a few
hundred place names — which is what keeps a country-wide choropleth inside the
bundle budget (`.size-limit.json`) without thinning the geometry.

Coordinates are projected once at build time (spherical Mercator) and quantised
to whole viewBox units — 12.000 units across Germany, about 53 m each — so
nothing is projected at runtime and the path data stays short.

### Why the borders meet

Simplifying each postal code on its own tears the map apart, and it took a
three-village demo to make it obvious: a border two codes share gets simplified
**twice**, independently. Douglas–Peucker keeps a different subset of vertices
for each, and each may stray up to the tolerance from the true line — in
opposite directions. What the reader sees is a wedge of page colour between two
areas that touch in reality, up to twice the tolerance wide. At 53 m that is a
hundred metres of nothing, plainly visible at the zoom the map opens at. It had
always been there; a hairline stroke in the page colour hid it until the areas
got a visible outline.

So the build stops treating a postal code as a closed ring and treats the map as
the planar graph it is — the idea TopoJSON is built around:

1. Every ring of every code is quantised and **held** (this is why the script
   asks for `--max-old-space-size=8192`; 3,6 M vertices have to be in memory
   together, and the simplification cannot know where a border runs one
   streamed feature at a time).
2. `findJunctions` marks the points where the graph branches — a vertex with
   more than two distinct neighbours across all rings. A vertex in the middle of
   a border has exactly two, whoever walks through it and in whichever
   direction; a third means a second code joins, or a shared border gives way to
   a coast one of them has to itself.
3. Each ring is cut at those points and every **arc** between two of them is
   simplified on its own. Douglas–Peucker is symmetric under reversal — the tie
   between two vertices exactly equally far from the chord is broken by
   coordinate, not by which end the walk started at — so the two codes either
   side of a border get the same vertices back and agree on it by construction,
   at any tolerance.

Measured on the real data: segments that belong to exactly one area — the
signature of a sliver, inland — went from **182.955 to 16.916**, and the 16.916
are the national border and the coast, which legitimately have no neighbour.
Every inland postal code now has none at all. The artefact grew 1,4 %.

**The silhouette travels with the areas on purpose.** It used to be a cacheable
static file under `public/`, until a rebuild changed the map's extent and
browsers holding yesterday's viewBox drew today's areas a few kilometres off.
One artefact, one coordinate system, no way for the two to disagree.

### Regenerating

Four downloads, none of them automated — the artefacts are committed, so this
runs when the data should be refreshed, not on every build.

```sh
# Postal-code areas (ODbL, from OpenStreetMap via Overpass)
curl -L -o /tmp/plz.geojson.br \
  https://github.com/yetzt/postleitzahlen/releases/latest/download/postleitzahlen.geojson.br
brotli -d /tmp/plz.geojson.br -o /tmp/plz.geojson

# Place names and postal-code → place (CC BY 4.0)
curl -L -o /tmp/gn-zip.zip   https://download.geonames.org/export/zip/DE.zip
curl -L -o /tmp/gn-dump.zip  https://download.geonames.org/export/dump/DE.zip
curl -L -o /tmp/gn-alt.zip   https://download.geonames.org/export/dump/alternatenames/DE.zip
unzip -o /tmp/gn-zip.zip  -d /tmp/geonames
unzip -o /tmp/gn-dump.zip -d /tmp/gn-dump
unzip -o /tmp/gn-alt.zip  -d /tmp/gn-alt

# The national border, its way tags, and the coastline (ODbL, Overpass)
OVP=https://overpass-api.de/api/interpreter   # overpass.kumi.systems if it times out
curl -sG "$OVP" --data-urlencode 'data=[out:json][timeout:200];rel(51477);out geom;' -o /tmp/de-boundary.json
curl -sG "$OVP" --data-urlencode 'data=[out:json][timeout:150];rel(51477);way(r);out tags;' -o /tmp/de-waytags.json
curl -sG "$OVP" --data-urlencode 'data=[out:json][timeout:450];way["natural"="coastline"](53.0,6.2,55.2,14.6);out geom;' -o /tmp/de-coast.json

cd frontend
npm run map:build -- --in /tmp/plz.geojson --names /tmp/geonames/DE.txt \
  --places /tmp/gn-dump/DE.txt --altnames /tmp/gn-alt/DE.txt \
  --boundary /tmp/de-boundary.json --boundary-tags /tmp/de-waytags.json --coast /tmp/de-coast.json
```

`--tolerance <units>` overrides the simplification (default 1, i.e. the
quantisation grid itself). The run takes some minutes: the input is half a
gigabyte of pretty-printed JSON, past the point where `JSON.parse` can take it
in one bite, so it is streamed and read twice — once for the extent the
projection is fitted to, once for the geometry.

Without the artefacts the endpoints answer 500 and log
`[map] no postal-code geometry found`. A deployment that has never run the build
script has no map, and an operator should find that in the log rather than as a
blank page.

### Why the border comes from two queries

The boundary relation is `admin_level=2`, which in the north is the **territorial
sea** — twelve nautical miles out, drawn as arcs around the basepoints. Those
arcs are correct and look like a rendering fault: a coast that bulges into the
sea in smooth curves. So the ways tagged `maritime=yes` are dropped and the real
coastline is stitched in where they were. The coastline is fetched as a
rectangle, which also catches the Danish, Dutch and Polish coasts either side;
those are sorted out by asking whether a way lies inside the full relation —
territorial waters included, which is exactly the test for "is this stretch of
coast German".

Deriving the outline from the postal-code areas instead was tried twice and
dropped twice.

The first attempt cancelled every border two areas share, at a resolution coarse
enough to fit in memory — which makes a jagged coastline cancel _itself_
wherever it leaves and re-enters the same cell, and leaves a border full of
holes. The arc topology above removes that objection: the union boundary is
exactly the segments that belong to one area, and after the topology stage those
are findable exactly.

It was tried again on that basis, and the data says no. The 16.916 boundary
segments have **185 nodes of degree one** — dangling ends, where the union's
perimeter simply stops because the source itself is not watertight along its own
edge. The chains therefore do not close into rings; the largest one encloses
3,4 M square units against Germany's 127 M. Making a silhouette out of that
means inventing the bridges, which is a worse thing to have in the artefact than
two datasets that disagree by a few hundred metres.

Which is what the coast is: the silhouette and the areas come from different
data and will never coincide exactly. The part that _is_ ours is the
simplification — the silhouette runs at `OUTLINE_TOLERANCE` while the areas run
at 1 ≈ 53 m, and the coast is the one place the two are drawn on top of each
other. It was 6 ≈ 320 m, which was argued from the national border (off screen
at that zoom) and did not hold for the coast; it is now 3 ≈ 160 m.

`--outline-tolerance` overrides it, and the silhouette travels with every
`/karte` visit, so this is a payload decision rather than a free one:
6 → 21 kB, **3 → 34 kB**, 2 → 45 kB, 1 → 79 kB.

### Licences

- **Postal-code areas, national border, coastline** — OpenStreetMap, **ODbL**.
  That obliges us to name the source and to keep any derived database under the
  same licence; the artefacts in this repository are such a derived database.
- **Place names** — GeoNames, **CC BY 4.0**.

Both are named in the map's footer (`MAP_ATTRIBUTION` in `shared/map.ts`).

## How it is drawn

`src/components/MemberMap.vue`, hand-written inline SVG for the same reason as
`AdminTrendChart.vue`: a mapping library would eat most of the remaining bundle
budget — and would not help with the part that is actually work here. Leaflet
brings no German postal-code geometry, and what it does bring is _tiles_, which
would send every member's IP and map position to a third party on every visit.

The whole map costs **4.8 kB brotli** of client bundle (its two chunks measured
at 4155 + 671 bytes). The JS budget in `.size-limit.json` went from 220 to
235 kB when it landed — not because the map is heavy, but because the app was
already sitting at 219.9 kB and the next feature of any size was going to break
it either way.

- **Framing** — the map opens on the extent the members cover plus a margin,
  not on the whole country. Zoom by button or wheel, pan by dragging, out to the
  country and in to about three kilometres across.
- **Fill** — a single-hue sequential ramp (sienna), five fixed classes at
  1 / 2–3 / 4–7 / 8–15 / 16+. Fixed rather than derived from the data, so a
  postal code does not change colour because somewhere else grew. The dark-mode
  steps are chosen against the dark surface, not flipped; both ramps are
  monotone in lightness.
- **Outline** — each area is drawn in its step's own ink. It used to be a
  hairline in the _surface_ colour, which separates two neighbours only where
  there is page behind them: three villages that share borders and all hold one
  member ran together into a single blob. The ink of a step is the colour its
  numbers were contrast-checked against, so the edge is legible on every step
  and in both modes without a second palette to keep in sync.
- **Dot** — every area also carries a dot at its centroid, sized by √count. It
  is what makes city postal codes visible at all: 10115 Berlin is a few hundred
  metres across and vanishes at country scale. Dots and type are divided by the
  zoom so they keep their size on screen while the map grows under them.
- **Labels** — the member counts are placed first, largest first, skipping
  whatever would collide. Place names take what is left, each tried below its
  dot, then above, then to either side, at increasing distance: a town with
  members has a mark sitting on it, and a single fixed position would silence
  exactly the name a reader most wants. Because the type keeps its size on
  screen it _shrinks_ in map units as the map grows, which is what makes a
  village's name appear as soon as somebody zooms in far enough for it to fit.
- **Table** — the same numbers as a screen-reader-only table. SVG circles are
  nothing to a screen reader, and the legend alone does not carry the values.
- **No tooltip.** There was one; it said the postal code and the count, both of
  which the map already shows.

The page is laid out to fit the height it is given rather than to scroll — a map
is zoomed, not scrolled past. That needs `min-h-0` on the layout's wrappers
(a flex item may otherwise not shrink below its content) and `h-full` on the
page, so the SVG has a definite height to fit into instead of asking its
container how tall it should be while the container asks it back.

## What the map does not do

- **No small-count threshold.** A postal-code area holds thousands of
  households; "1" identifies nobody, and the map is behind the login anyway.
  Should that judgement change, the place to change it is `buildMapPayload`
  in `server/helpers/memberMap.ts`.
- **No unlocated silence.** A postal code that matches no area (a typo, a
  foreign address) is counted in `unlocated` and named under the map. A map that
  quietly loses people reads as complete when it is not.
