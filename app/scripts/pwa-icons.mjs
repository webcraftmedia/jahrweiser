/**
 * Renders the home-screen icons from the round GG&G logo.
 *
 * The logo is a peach circle on transparent ground. On a home screen the
 * platform cuts its own shape out of the icon — a rounded square on iOS, a
 * circle, squircle or teardrop on Android, depending on the launcher — so a
 * round logo inside that shape leaves transparent (iOS: black) corners and a
 * ring where the two edges almost meet. The icon is therefore *full bleed*: the
 * peach fills the whole square, the circle and its drop shadow are dropped, and
 * only the letters are placed — small enough to stay inside the maskable safe
 * zone, the inner circle of 80 % diameter that every mask is guaranteed to keep
 * (https://www.w3.org/TR/appmanifest/#icon-masks).
 *
 * The letters are not placed by hand: they are rendered once on their own and
 * measured, so a changed logo is re-centred and re-scaled by running this again.
 *
 * Output: public/pwa/<name>.<hash>.png plus assets/pwa-icons.json, which
 * nuxt.config.ts reads for the manifest and the apple-touch-icon link, and the
 * icon reference in public/offline.html is rewritten. The hash
 * in the file name is the cache-buster — installed apps and the iOS home screen
 * keep an icon URL they have seen forever, so a new icon needs a new URL.
 *
 * Needs `rsvg-convert` (librsvg) and `magick` (ImageMagick 7) on the PATH. Only
 * run when the logo changes; the PNGs are committed.
 *
 * Usage: npm run pwa:icons
 */
/* eslint-disable no-console -- a CLI; its report is stdout */
/* eslint-disable security/detect-non-literal-fs-filename -- paths are this
   repository's own files, built from constants below */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const SOURCE = join(APP_DIR, 'assets/logo-small.svg')
const OUT_DIR = join(APP_DIR, 'public/pwa')
const INDEX = join(APP_DIR, 'assets/pwa-icons.json')
/** Static page that shows the 192 icon and has no build step to resolve it. */
const OFFLINE_PAGE = join(APP_DIR, 'public/offline.html')

/** The logo's own circle colour (tailwind has no token for it). */
const BACKGROUND = '#ffe0c6'

/** Working resolution of the master image every size is scaled down from. */
const MASTER = 1024

/**
 * Radius the letters may reach, as a share of the icon's edge. The safe zone is
 * 0.40; the rest is headroom for the letters' drop shadow and anti-aliasing.
 */
const LETTER_RADIUS = 0.38

/** Alpha (0–255) above which a pixel counts as part of the letters. */
const ALPHA_THRESHOLD = 24

const ICONS = [
  { name: 'icon-192', size: 192 },
  { name: 'icon-512', size: 512 },
  { name: 'apple-touch-icon', size: 180 },
]

/** The logo without its circle (and with it the circle's drop shadow). */
function lettersOnly(svg) {
  const withoutCircle = svg.replace(/<circle\b[^>]*\/>/, '')
  if (withoutCircle === svg) throw new Error(`No <circle> found in ${SOURCE}`)
  return withoutCircle
    .replace(/<\?xml[^>]*\?>/, '')
    .replace(/(<svg\b[^>]*?)\swidth="[^"]*"/, `$1 width="${MASTER}"`)
    .replace(/(<svg\b[^>]*?)\sheight="[^"]*"/, `$1 height="${MASTER}"`)
}

function render(svg, size) {
  return execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-f', 'png'], {
    input: svg,
    maxBuffer: 64 * 1024 * 1024,
  })
}

/**
 * Centre and reach of the letters in a MASTER×MASTER rendering: the centre of
 * their bounding box, and the distance from it to the farthest inked pixel —
 * the radius that has to fit into the safe-zone circle, which a bounding box
 * alone would overstate in the corners.
 */
function measure(png) {
  const rgba = execFileSync('magick', ['png:-', '-depth', '8', 'rgba:-'], {
    input: png,
    maxBuffer: 64 * 1024 * 1024,
  })
  let minX = MASTER
  let minY = MASTER
  let maxX = -1
  let maxY = -1
  const inked = []
  for (let y = 0; y < MASTER; y++) {
    for (let x = 0; x < MASTER; x++) {
      if (rgba[(y * MASTER + x) * 4 + 3] > ALPHA_THRESHOLD) {
        inked.push(x, y)
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('The letters rendered empty — check the source SVG')
  const cx = (minX + maxX + 1) / 2
  const cy = (minY + maxY + 1) / 2
  let reach = 0
  for (let i = 0; i < inked.length; i += 2) {
    // Pixel centre, not its corner.
    reach = Math.max(reach, Math.hypot(inked[i] + 0.5 - cx, inked[i + 1] + 0.5 - cy))
  }
  return { cx, cy, reach }
}

function fullBleed(letters, { cx, cy, reach }) {
  const scale = (LETTER_RADIUS * MASTER) / reach
  const half = MASTER / 2
  const transform =
    `translate(${half} ${half}) scale(${scale.toFixed(5)}) ` +
    `translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MASTER}" height="${MASTER}" ` +
    `viewBox="0 0 ${MASTER} ${MASTER}">` +
    `<rect width="${MASTER}" height="${MASTER}" fill="${BACKGROUND}"/>` +
    `<g transform="${transform}">${letters}</g></svg>`
  )
}

const letters = lettersOnly(readFileSync(SOURCE, 'utf8'))
const metrics = measure(render(letters, MASTER))
const master = fullBleed(letters, metrics)

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

const index = {}
for (const { name, size } of ICONS) {
  const png = render(master, size)
  const hash = createHash('sha256').update(png).digest('hex').slice(0, 8)
  const file = `${name}.${hash}.png`
  writeFileSync(join(OUT_DIR, file), png)
  index[name] = { src: `/pwa/${file}`, size }
  console.log(`  ${file}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} kB`)
}

writeFileSync(INDEX, `${JSON.stringify(index, null, 2)}\n`)

const offline = readFileSync(OFFLINE_PAGE, 'utf8')
const offlineUpdated = offline.replace(/\/pwa\/icon-192\.[0-9a-f]+\.png/g, index['icon-192'].src)
if (!offlineUpdated.includes(index['icon-192'].src)) {
  throw new Error(`${OFFLINE_PAGE} has no /pwa/icon-192.<hash>.png reference to update`)
}
writeFileSync(OFFLINE_PAGE, offlineUpdated)
console.log(
  `Letters scaled to ${(LETTER_RADIUS * 100).toFixed(0)} % radius ` +
    `(safe zone 40 %); wrote ${readdirSync(OUT_DIR).length} icons and ${INDEX.slice(APP_DIR.length + 1)}`,
)
