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
| `GET /api/map/boundaries`  | Bundesland and Kreis borders inside a rectangle, by level and resolution       | session                           |
| `GET /api/map/postal-code` | `{ known, plz, ort }` — what the settings form checks against                  | session                           |

## The artefacts

Both are generated by `scripts/build-map-data.ts` and **committed**. The app
never fetches geodata at build or run time.

| File                                | Holds                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `server/assets/map/plz-areas.json`  | the viewBox, the country silhouette, and all ~8.200 postal-code shapes        |
| `server/assets/map/places.json`     | ~80.000 towns, villages and Stadtteile with a rank                            |
| `server/assets/map/boundaries.json` | ~18.000 Bundesland and Kreis border arcs at three resolutions, plus 415 names |

All three are server-side only, read through `useStorage('assets:server')`. The
endpoints send the client only what a view needs — a few dozen areas, a few
hundred place names, the borders that reach into the frame — which is what keeps
a country-wide choropleth inside the bundle budget (`.size-limit.json`) without
thinning the geometry.

Coordinates are projected once at build time (spherical Mercator) and quantised
to whole viewBox units — 12.000 units across Germany, about 53 m each — so
nothing is projected at runtime and the path data stays short.

### The 53 m grid is the floor, and the map zooms past it

No tolerance, however small, buys detail below one unit, and `MAX_ZOOM` lets the
map reach a three-kilometre frame — where **one unit is some twenty pixels**. Two
things follow, and both look like bugs until they are recognised:

- every boundary is a **staircase** of 53 m steps, and
- any real feature narrower than that **collapses**. The Hessen exclave at
  Ober-Laudenbach is reached by a corridor narrower than the grid, so its two
  sides round onto the same coordinates and the corridor is drawn as one line
  joining two shapes. Measured there: 83 vertices lie closer than a grid unit to
  a _different_ boundary way.

This was verified rather than assumed: the raw OSM ways, projected but unrounded,
carry no crossings and no staircase at that zoom — the 53 m rounding alone
produces both. It has always been true of the postal-code areas; the border lines
merely made it visible, being strokes on an empty page rather than edges of a
filled shape.

Left as it is, deliberately. The alternatives were measured and both cost more
than the defect:

- **A finer grid** (`VIEWBOX_WIDTH` 12.000 → 24.000 or 48.000) puts ~40 % resp.
  ~80 % on _every_ payload of this map, the aggregate included — and at 13 m the
  staircase is still five pixels at the deepest zoom.
- **Less zoom** (`MAX_ZOOM` down from 200) costs nothing but takes away the view
  a member most wants; the grid would only stop showing at around 20 km across.

So the map is schematic below roughly ten kilometres, and honest about it here.

### Why nothing is simplified into a knot

Douglas–Peucker guarantees that no vertex strays further than the tolerance from
the line it replaces. It guarantees **nothing about the result staying simple**,
and where a boundary doubles back on itself within the tolerance — a meander, a
corridor, the interlocking Hessen / Baden-Württemberg enclaves at Ober-Laudenbach
— the shortcut can jump the line to the wrong side of itself. What the reader
sees is a spike or a bow tie.

This is not a matter of picking a smaller tolerance. Measured on those enclaves,
the input has no self-intersections at any stage (lon/lat, projected, quantised)
and the simplified arcs had eight at tolerance 1, five of them inside a single
arc. So the result is **checked instead**: `simplifySafely` halves the tolerance
until the piece comes out simple, and zero is the floor — it drops none but the
exactly collinear vertices, so it cannot move a line at all.

Backing off beats refusing. Refusing to simplify a knotted stretch falls back on
geometry some ten times denser than the tolerance would have kept, and for the
silhouette that measured **51 kB against 34**; backing off costs 42 kB. Two
granularities matter for the same reason: the postal-code areas are checked per
**arc** (they have to agree with their neighbour, and Douglas–Peucker is
symmetric under reversal, so both sides back off to the same tolerance without
coordinating), the silhouette in **windows of 256 vertices** — a whole-ring check
makes one knot anywhere revert the entire coast, which measured 356 kB.

What this buys, country-wide: the silhouette went from 34 self-intersections to
**8**, the postal-code areas from 192 in 138 areas to **141 in 85**. It does not
reach zero, and the reason is structural: the check sees one arc or one window at
a time, and what is left crosses _between_ two of them. Closing that needs a
global pass over the assembled geometry with a spatial index, reverting the arcs
involved and repeating — worth knowing, not yet worth doing for a defect this
size in a filled shape.

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

### Why the administrative borders are arcs

A Bundesland or Kreis border is **stroked and never filled**, and the artefact is
built around that: the unit is not one shape per area but one **arc per OSM way,
deduplicated by way id**. The border two Kreise share is literally one way
carried by both relations, so it is stored once, drawn once, and the two
neighbours cannot disagree about where it runs — the sliver problem the
postal-code areas needed the whole topology stage above for does not arise here
at all. It also halves the artefact and gives every arc a bounding box for the
endpoint to cull against.

The three levels are a **partition, not three complete networks**: the state
layer leaves out the ways the silhouette already draws, the district layer
leaves out the ways the state layer draws. Nothing is painted twice, no dash
rides on top of a solid line — and because a coarser layer is always on screen
wherever a finer one is (see the staging below), no network looks torn.

Names travel beside the arcs as `[x, y, size, name]`: the relation's `label`
member where OSM has one, the centroid of its body otherwise, and the size is
what the client decides whether a name fits in. **`admin_centre` deliberately
does not stand in for a missing `label`** — that is the seat town, which already
carries its own name on the map.

One subtlety worth keeping: the label's _body_ is stitched from **every** way of
the relation, the `maritime=yes` ones included, while the ink is not. Dropping
the territorial-sea arcs leaves a coastal outline that no longer closes, and the
shoelace formula then reads the chord across the gap as the coast —
Schleswig-Holstein came out at a seventh of its area and lost its name to the
fit rule.

#### Why they are not simplified at all

`BORDER_TOLERANCE` is **0**, and that is not "simplification off": Douglas–Peucker
at a tolerance of zero still drops every vertex lying _exactly_ on the line
between the two it is judged against, which after quantisation is a great many
of them (the district layer keeps 344.000 of its segments, against 470.000
input vertices). What it cannot do is move a line. The result passes through
precisely the points the input did.

It took two wrong answers to get there, and both are worth keeping, because both
sound right.

**3 ≈ 160 m, the silhouette's tolerance.** Argued the same way: a reference line,
not a shape anyone measures. But Douglas–Peucker knows nothing about the feature
it is cutting, and where a whole shape is only a few tolerances across, that _is_
the shape. The interlocking Hessen / Baden-Württemberg enclaves around
Ober-Laudenbach are about a kilometre wide and came out a knot of spikes.

**1 ≈ 53 m, the grid itself.** The obvious retreat, and still wrong — because the
objection is not the size of the tolerance but the algorithm. **Douglas–Peucker
does not preserve topology.** Measured on those same enclaves: the input has
_zero_ self-intersections at every stage — lon/lat, projected, quantised — and
the simplified arcs have **eight**, five of them inside a single arc. A border
that crosses itself is wrong at every zoom, and no tolerance above zero rules it
out. (Counting crossings country-wide says the same: 23 / 74 at tolerance 3,
20 / 132 at 1 — the number does not fall with the tolerance, because it is not
what the tolerance controls.)

What remains at zero is the grid: **10 crossings in the state layer and 58 in the
district layer**, country-wide, where two borders pass within 53 m of each other
and swap sides when rounded. Those want a finer coordinate system, not a
different tolerance, and at 12.000 units across Germany they are what is on
offer.

The cost is real and is spent deliberately: the largest request either layer ever
answers goes from 30 to **67 kB brotli**, and the artefact from 929 kB to
2.277 kB. Unlike the silhouette, these borders are still drawn at the deepest
zoom the map allows — three kilometres across, where one grid unit is some twenty
pixels — so this is the layer where geometry is worth paying for.

#### Three times, at three resolutions

Paying for it everywhere turned out to be the wrong bargain, and it showed up as
lag when the map was zoomed out on a phone. A wide view fetches a whole
country's worth of border and cannot show a metre of the detail — and the cost
is not the bytes, it is the **parse**. Measured on the committed artefact:

| put on screen | Chromium | Firefox    |
| ------------- | -------- | ---------- |
| state, full   | 1 ms     | **30 ms**  |
| state, coarse | 1 ms     | 4 ms       |
| Kreis, full   | 7 ms     | **154 ms** |
| Kreis, coarse | 1 ms     | 25 ms      |

Firefox blocks its main thread for the whole of that every time the layer is set,
which is every zoom-out — on a phone, several times those numbers. So each level
is stored more than once, thinned to a tolerance it cannot be told from at the
scale it is served at:

| copy                          | tolerance | Kreis vertices |
| ----------------------------- | --------- | -------------- |
| `arcs` (`BORDER_TOLERANCE`)   | 0         | 359.295        |
| `medium` (`MEDIUM_TOLERANCE`) | 1 ≈ 53 m  | 126.257 (35 %) |
| `coarse` (`COARSE_TOLERANCE`) | 4 ≈ 212 m | 52.861 (15 %)  |

**The middle one was added later, and the reason is the second cost.** Two stages
answered the parse — the one that hurt on zooming out — and left a factor of nine
between them, which the _raster_ then walked into. Panning re-draws whatever is on
screen on every frame, and the Kreis layer fades in at a scale where `perPixel` is
2 to 4: the layer became visible and nine times finer within one press of the zoom
button. Measured there, one pan cost **1,25 s of main thread** and dropped sixteen
frames of fifty. With the middle stage it is 468 ms and two.

Its tolerance is not a compromise picked for size. It is one **grid unit** — the
quantisation the whole map is built on (see "The 53 m grid is the floor"), so no
line in the artefact can be truer than that anyway. What it drops is detail the
file only appears to have, and that turns out to be two thirds of the vertices.

**The client chooses, because it is the only party that knows how big a pixel
is.** It sends `perPixel` — viewBox units per CSS pixel, the scale it is drawing
at — and `resolutionFor` in `shared/map.ts`, which both sides run, returns the
coarsest copy whose error stays under a pixel: each threshold is that copy's own
tolerance. A rule based on the requested box would have had to guess at a screen
size and would be wrong on both a phone and a wall display. The resolution is
remembered with the region, so zooming in past it fetches again.

An artefact that predates a stage simply has no list for it, and `copyAt` then
falls back towards the fine arcs rather than answering with an empty map.

Measured end to end: the country view went from 66.983 drawn segments to
**10.262**, and the view the Kreis layer arrives in from 171.150 to **9.029**.

### Regenerating

Downloads, none of them automated — the artefacts are committed, so this runs
when the data should be refreshed, not on every build.

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

# Bundesländer and Kreise, plus the maritime ways to drop from both (ODbL)
curl -sG "$OVP" --data-urlencode 'data=[out:json][timeout:600];rel["boundary"="administrative"]["admin_level"="4"]["ISO3166-2"~"^DE-"];out geom;' -o /tmp/de-states.json
curl -sG "$OVP" --data-urlencode 'data=[out:json][timeout:900];area(3600051477)->.de;rel(area.de)["boundary"="administrative"]["admin_level"="6"];out geom;' -o /tmp/de-districts.json
curl -sG "$OVP" --data-urlencode 'data=[out:json][timeout:600];area(3600051477)->.de;rel(area.de)["boundary"="administrative"]["admin_level"~"^(4|6)$"];way(r)["maritime"="yes"];out tags;' -o /tmp/de-maritime.json

cd frontend
npm run map:build -- --in /tmp/plz.geojson --names /tmp/geonames/DE.txt \
  --places /tmp/gn-dump/DE.txt --altnames /tmp/gn-alt/DE.txt \
  --boundary /tmp/de-boundary.json --coast /tmp/de-coast.json \
  --boundary-tags /tmp/de-waytags.json,/tmp/de-maritime.json \
  --states /tmp/de-states.json --districts /tmp/de-districts.json
```

`--tolerance <units>` overrides the simplification of the areas (default 1, the
quantisation grid itself), `--border-tolerance` that of the administrative
borders (default 0, see above) and `--outline-tolerance` that of the silhouette
(default 3, the only one of the three that may be coarse). The run takes some
minutes: the postal-code input is
half a gigabyte of pretty-printed JSON, past the point where `JSON.parse` can
take it in one bite, so it is streamed and read twice — once for the extent the
projection is fitted to, once for the geometry. The Kreis answer is another
hundred megabytes and is streamed for the same reason.

`--boundary-tags` takes a comma-separated list because the maritime ways come
from two queries (the national relation, and the administrative levels); a way
is maritime for all of them or for none.

**Restart the dev server after any rebuild.** All three artefacts are parsed
**once per process** and then kept (`loadPlzAreas`, `loadPlaces`,
`loadBoundaries` in `server/helpers/memberMap.ts`) — they never change at
runtime, which is exactly why the cache is there. HMR does not help: the JSON
changed, the module holding it did not. Reloading the browser gets a fresh
request and the same stale answer.

**Refreshing only the borders.** A Kreisreform has nothing to do with the postal
codes, and the two data sets age independently:

```sh
npm run map:build -- --only-borders \
  --boundary /tmp/de-boundary.json --coast /tmp/de-coast.json \
  --boundary-tags /tmp/de-waytags.json,/tmp/de-maritime.json \
  --states /tmp/de-states.json --districts /tmp/de-districts.json
```

That skips both passes over the postal codes and takes seconds instead of
minutes. It works because `plz-areas.json` records the projection it was built
with (`proj`: the Mercator origin and the scale) — so the borders land in the
_same_ coordinate system rather than in a freshly measured one that would differ
by a unit and draw them a few hundred metres off the areas. An artefact from
before that field existed makes the mode refuse, naming the full build.

**Adding a resolution without re-downloading the world.** Both of the thinned
copies are derived from the raw OSM answers by the build — which means adding a
stage would otherwise mean fetching a few hundred megabytes of Overpass output
to re-derive geometry that is already committed. `npm run map:thin` does it from
the artefact instead:

```sh
npm run map:thin                       # MEDIUM_TOLERANCE, in place
npm run map:thin -- --tolerance 2 --dry-run
```

That this gives the same answer as the build rests on one fact and would be
wrong without it: `BORDER_TOLERANCE` is **0**, so the stored arcs have lost
nothing but vertices lying exactly on the line between their neighbours — and
such a vertex can never be the farthest point from a chord it already lies on,
so it changes no Douglas–Peucker decision at any tolerance above zero. Both
routes run the same `scripts/map/geometry.ts`, which is its own module for
exactly this reason: two copies of Douglas–Peucker would drift, and the one
thing this code may not do is give two callers different answers for the same
line.

The build still produces the stage itself, so the next full run does not lose
it — the script is the way to have it _today_, not a replacement.

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
  not on the whole country. Zoom by button, wheel or **pinch**, pan by dragging,
  out to the country and in to about three kilometres across.

  The pinch is the map's own, not the browser's. `touch-action: none` is what
  keeps a drag across the map from scrolling the page, and it switches off the
  browser's pinch along with it — without this a phone could only zoom by the
  buttons, on the one device where reaching for a button is the awkward way to
  do it. Every pointer down is tracked; two of them are a gesture, measured
  against the _previous_ move rather than the start, so spreading to zoom and
  travelling to pan come out as one motion without either having to know about
  the other. Lifting one of two fingers hands the gesture to the one still down
  rather than stopping the map dead.

- **Orientation** — the country silhouette answers "where is this" in the
  opening view and stops answering it the moment anyone zooms in: three postal
  codes and a few village names on an empty page could be anywhere in Germany.
  So the job is handed down the administrative ladder as the map grows.
  See the staging below.
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
- **Merged dots** — zoomed out, neighbouring postal codes are closer together
  than their dots are wide. Those dots become **one dot carrying the sum**,
  merged transitively (A over B over C is one dot, or A and C would still be
  covering each other) and repeatedly, since each merge makes the survivor
  bigger. It sits at the members' weighted centre, and grows and colours like
  any other dot of that number — which does mean a merged dot can be a step
  darker than either area under it: the dot encodes the number it shows.

  Before this, one circle simply landed on top of another and the label pass
  dropped whichever number lost, so the map said "2" where three members live
  with nothing to say anything was missing. Nothing here decides a scale: zoom
  in, the dots shrink in map units, and the codes come apart on their own. The
  areas and the table stay one per postal code — the dot is a mark on the map,
  not the datum.

- **Labels** — every member count is drawn. There used to be a pass that dropped
  a count whose box covered one already placed; merging the dots made it
  unreachable, because the radius floor holds a label of `digits` digits inside
  a dot of `0.32·digits + 0.42` ems while the box it needs is `0.31·digits +
0.25` wide — a number is always strictly inside its own dot. Place names take
  what is left, each tried below its dot, then above, then to either side, at
  increasing distance: a town with members has a mark sitting on it, and a
  single fixed position would silence exactly the name a reader most wants.
  Because the type keeps its size on screen it _shrinks_ in map units as the map
  grows, which is what makes a village's name appear as soon as somebody zooms
  in far enough for it to fit.
- **Table** — the same numbers as a screen-reader-only table. SVG circles are
  nothing to a screen reader, and the legend alone does not carry the values.
- **No tooltip.** There was one; it said the postal code and the count, both of
  which the map already shows.

### The staging of the administrative layers

Nothing here is a switch the reader has to find. A layer that would be noise at
the current scale is not offered and then hidden; it is simply not yet drawn.
The trigger is **how much of the country is on screen** — a scale rather than a
zoom step, so it means the same thing on a phone and on a wall screen. Germany
is about 640 km across, and the figures below are that width; the map measures
the same thing by area (see below), so they hold whatever shape the window is.

| Layer              | Full         | Handover     | Off          |
| ------------------ | ------------ | ------------ | ------------ |
| Country silhouette | always       | —            | —            |
| Bundesland borders | always       | —            | —            |
| Bundesland names   | above 153 km | 153 → 99 km  | below 99 km  |
| Kreis borders      | below 102 km | 178 → 102 km | above 178 km |
| Kreis names        | below 99 km  | 120 → 99 km  | above 120 km |

Sixteen state borders are never clutter, so that layer simply stays. The Kreis
**line** arrives well before the Kreis **name**: a border tells you that you have
crossed something, and at 150 km across there is no room to say what.

#### Which scale, exactly — and why it is not the view's width

`preserveAspectRatio="meet"` fits the requested rectangle _inside_ the box and
fills the rest with map, so a window wider than the country's own proportions
shows considerably more than was asked for: at 1920×1080 the drawing is **2,4
times wider on screen** than the view it was asked for. Staging on the requested
view therefore did not do what the paragraph above claims — it brought the Kreis
layer in over that extra width too, at 290 km across where it was meant to
arrive at 180.

That was not only a scale being wrong by a factor. It was the map's performance
problem: four times the border geometry at the very zoom the layer appears, which
measured **3,5 seconds of main thread per pan** and a p95 frame time of 133 ms.

So `span` is measured on what is **visible**, and **by area**:

```
span = √(visible.w · visible.h) ⁄ √(full.w · full.h)
```

By area rather than by width because that is what the cost scales with — the
request, the vertices and the rasterising all grow with the rectangle and not
with one of its sides. Normalising against the country's own area makes this
identical to the old value whenever the window happens to match the map's
proportions, which is why the thresholds above kept their numbers. A 16:9 desktop
comes out 1,55 times larger, a 1500×900 laptop 1,33, a phone 1,10 — the phone
barely moves, which is the point.

**Country and Bundesland are drawn at one weight**, because they are one line:
the national border _is_ the outer edge of the state network, the stretch of it
that happens to have no German neighbour. Drawing the inner stretches heavier
(it was 1.4 px against 1.0) split a single class of line in two, and the country
came out looking like the lesser of them. The Kreise stay apart by **strike**
rather than by weight — a dash is legible where half a pixel is not, and it
survives a reader who cannot tell 1.4 px from 0.8.

The two sets of names hand over across a deliberately **narrow** band — narrower
than one press of the zoom button, which is a factor of 1.6. Type at a third of
its opacity is not a label that is arriving, it is a smudge; crossing the band
in one step reads as a handover, sitting in the middle of it reads as a fault.
A CSS `opacity` transition smooths the jump, and is dropped under
`prefers-reduced-motion`.

**Which levels are fetched** follows the same numbers, a little ahead of them
(`PREFETCH`), so the lines are there when the fade starts. The Kreis layer is
never asked for at country scale, which is what keeps the request small: the
whole network is ~380 kB of path data, a view at the scale it appears is ~70 kB,
and one at 60 km across is 2 kB. A level that drops off the list is **let go
of**, not kept for a return visit — half a megabyte of Kreis path used to sit in
the DOM at `opacity: 0` all the way out to the country view. `PREFETCH` is what
makes that safe: by the time a level leaves the list it has been invisible for a
whole zoom step, so there is no fade left to interrupt.

The fetched region carries a much smaller margin than the place names do (0.15
against 0.6), and it is **refetched far more eagerly** (1.5 against 3). Both
follow from the two going stale for opposite reasons:

- A place answer is only ever too **coarse**. Zoom in and the capped list would
  now have room for villages it did not send — but the names on screen are still
  the right ones, so it can wait until the view is a third of what was asked for.
- A border answer becomes too **large**. Every arc it still holds for the region
  that has left the screen is rasterised on every single frame. Measured at the
  zoom the district layer arrives at: the view needed 40.000 vertices and the map
  was drawing the 92.000 fetched two steps earlier.

A margin is paid for in _area_, which is the easy thing to under-estimate: 0.3 a
side grows the box to 1,6× in each direction and so to **2,56× the area**,
meaning three fifths of what the client holds can never be seen.

**A name is only set if it fits its own area.** √area is the side of the square
of the same area, a fair stand-in for the room a name has in a shape nobody has
measured the width of; a name that would have to be set smaller than it can be
read is left off. That is what makes a Kreis name appear as the map grows
without anything deciding at which zoom it should, and it is why Bremen and
Hamburg are never labelled as states and Mecklenburg-Vorpommern only once the
country view has been left.

In the label pass the order is the priority: member dots, then Bundesland names
(placed by nothing, but blocking — a village name printed across one leaves two
unreadable words instead of one legible one), then Kreis names, then places.
A Kreis name sits **at its own label point or nowhere**: shifted aside to dodge a
village it would be pointing at the wrong area, which is worse than missing. At
most sixteen are drawn, largest first, or a view over the Ruhr is twenty names
deep before a single town is written.

The page is laid out to fit the height it is given rather than to scroll — a map
is zoomed, not scrolled past. That needs `min-h-0` on the layout's wrappers
(a flex item may otherwise not shrink below its content) and `h-full` on the
page, so the SVG has a definite height to fit into instead of asking its
container how tall it should be while the container asks it back.

### Measuring what it costs

`e2e/map.perf.spec.ts` pans the map at every zoom step from the country down and
reports frame times and main-thread time per pan. It is served from the
**committed artefacts** rather than from the behaviour mocks
(`e2e/helpers/map-real-data.ts` runs the real `boundaryLayerIn`, `placesIn` and
`buildMapPayload` against the real files, with the database and DAV left out) —
the ordinary mock draws two triangles and four border segments, which cannot
show a cost that only exists at a hundred thousand vertices.

```sh
MAP_PERF=1 npx playwright test e2e/map.perf.spec.ts --reporter=list
```

It is out of the ordinary suite because timings on a shared runner are noise, and
a benchmark that fails the build teaches everyone to ignore it. `MAP_PERF_CPU=4`
throttles to roughly a mid-range phone, `MAP_PERF_WIDTH`/`HEIGHT` change the
window, `MAP_PERF_COARSE=1` answers every request with the coarse copy — a probe,
not a setting, for "would the coarser geometry have done here".

Three things it has already settled, all of which sounded plausible the other way:

- **The cost is vertices and nothing else.** With the layer's geometry held
  fixed, switching off `stroke-dasharray` and `vector-effect: non-scaling-stroke`
  changed the main-thread time by 4 % and 2 % — inside the noise — while removing
  the layer altogether took it to 8 %. Dashing a path of 135.000 segments is not
  what is expensive; having 135.000 segments is. The dash therefore stays.
- **It is not script.** Of 3.868 ms per pan, script was 8 ms and layout 41. The
  label pass and the dot merging, both of which recompute on every frame of a
  drag, are not worth optimising.
- **It is not the arcs being too long.** They are not: the median district arc is
  15 vertices across 1,4 km, and 54–61 % of every answer's vertices land inside
  the visible rectangle — which is exactly the margin, and nothing else.

Where that left the map, at 1920×1080, panning at the zoom the Kreis layer
arrives at:

|                     | before   | after     |
| ------------------- | -------- | --------- |
| vertices drawn      | 171.150  | 44.580    |
| main thread per pan | 3.868 ms | ~1.000 ms |
| frames over 32 ms   | 25 of 60 | 13 of 53  |

## What the map does not do

- **No small-count threshold.** A postal-code area holds thousands of
  households; "1" identifies nobody, and the map is behind the login anyway.
  Should that judgement change, the place to change it is `buildMapPayload`
  in `server/helpers/memberMap.ts`.
- **No unlocated silence.** A postal code that matches no area (a typo, a
  foreign address) is counted in `unlocated` and named under the map. A map that
  quietly loses people reads as complete when it is not.
