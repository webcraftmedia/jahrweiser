# Umami + Nuxt-Binding — Umsetzungsplan

Status (26.09.2026):

- **Teil 1 (Umami-Instanz) ist ausgeplant und scriptbar** → eigene Doku:
  [`umami-server.md`](umami-server.md), Scripts in `infra/umami/`.
  Native Alpine-Installation, kein Docker; die Compose-Skizze weiter unten ist
  damit überholt und nur noch als Vergleich stehengeblieben.
- **Teil 2 (Nuxt-Binding) ist weiterhin geplant, nicht umgesetzt.**

Nach der Umsetzung von Teil 2 wird dieses Dokument zur Referenz-Doku
umgeschrieben.

Ziel: eine geteilte Umami-Instanz für alle Produkte, Jahrweiser als erstes
angebundenes Produkt. Tracking ist **verdrahtet, aber standardmäßig aus** —
einschaltbar ohne Code-Änderung.

Was **nicht** in diesem Schritt drin ist: Consent-Banner-UI, Grafana-Anbindung,
Server-Log-Pipeline (Alloy/VictoriaLogs), Custom-Events. Die Nahtstellen dafür
sind vorgesehen und unten benannt.

---

## Teil 0 — Die drei Erkenntnisse, die den Plan bestimmen

Ohne die liest sich der Rest wie Willkür.

### 1. Login- und Register-Token stehen im **Pfad**, nicht im Query-String

`app/src/pages/login/[token].vue` und `register/[token].vue`. Umami speichert
`url_path` wörtlich. Ein naives `autoTrack: true` schreibt damit jeden
Magic-Link-Token in die Analytics-Datenbank — ein Secret in einem zweiten
Datenspeicher, mit anderer Retention und anderem Backup-Kreis.

`excludeQueryParams` hilft hier **nicht**, weil das Secret nicht im Query steht.

→ Deshalb: `autoTrack: false` und ein eigener Wrapper, der das **Route-Pattern**
statt der konkreten URL meldet (`/login/:token` statt `/login/a7f3…`). Nebeneffekt:
keine Kardinalitäts-Explosion in den Reports.

### 2. `nuxt-umami` konfiguriert sich zur **Build-Zeit**, nicht zur Laufzeit

Das Modul rendert `enabled`, `host`, `id` und den Betriebsmodus in ein
Build-Template (`#build/umami.config.mjs`). `enabled: false` erzeugt einen
No-op-Modus, der fest im Bundle steht. Ein Umschalten braucht `npm run build`.

Für unser „nicht notwendigerweise anschalten" ist das zu grob. Also zwei Ebenen:

| Ebene         | Was                                            | Umschalten per                    |
| ------------- | ---------------------------------------------- | --------------------------------- |
| **Build**     | Modul aktiv, Proxy-Route existiert, Host + ID  | `npm run build` (Deploy)          |
| **Laufzeit**  | ob überhaupt gesendet wird                     | `.env` + `pm2 restart` (kein Build) |

Die Laufzeit-Ebene ist **unser** Code: `runtimeConfig.public.analyticsEnabled`,
abgefragt im Wrapper **und** in einer Nitro-Middleware. Dass der Deploy
(`deploy.sh`) auf dem Host baut und `app/.env` beim Build wie beim Start gelesen
wird (pm2: `--env-file-if-exists=.env`), macht beide Ebenen praktikabel.

### 3. Das Modul hat schon einen Opt-out-Hebel

`localStorage['umami.disabled'] === '1'` blockt jeden Send-Call in der Library
selbst — vor allen unseren Aufrufstellen. Den nutzen wir statt einen eigenen
Mechanismus zu bauen: greift auch an Stellen, die wir vergessen.

---

## Teil 1 — Umami-Instanz (geteilt, alle Produkte)

Eine Instanz, darin pro Produkt eine Website mit eigener `websiteId`. Siehe die
Begründung für Shared-Backend in der Architektur-Diskussion; Kurzform: nur so ist
produktübergreifende Auswertung ein SQL-Join statt einer Tool-Integration.

### Wo das liegt — entschieden

`infra/umami/` in diesem Repo, mit der Absicht, es später in ein eigenes
`infra-observability`-Repo zu ziehen. Ablauf und Betrieb: siehe
[`umami-server.md`](umami-server.md).

**Docker ist es nicht geworden.** Seit Umami 3 / Prisma 7 gibt es keine
Rust-Query-Engine mehr, damit fällt der musl-Grund für den Container weg; alle
verbliebenen nativen Abhängigkeiten liefern `*-musl`-Binaries, das Lockfile
kennt kein `node-gyp`. Betrieben wird der Next.js-Standalone-Server unter
OpenRC, Postgres 17 aus `apk`. Preis: ein Update ist ein Rebuild auf der Box
(5–15 min, ~4 GB RAM) statt eines `pull`.

### Compose-Skizze (überholt, nur als Vergleich)

```yaml
services:
  umami:
    image: ghcr.io/umami-software/umami:postgresql-<VERSION>   # Tag pinnen, nicht latest
    restart: unless-stopped
    ports:
      - 127.0.0.1:3010:3000        # nur lokal; Exposure macht der Reverse-Proxy
    environment:
      DATABASE_URL: postgresql://umami:${UMAMI_DB_PASSWORD}@db:5432/umami
      APP_SECRET: ${UMAMI_APP_SECRET}
      DISABLE_TELEMETRY: '1'
    depends_on:
      db: { condition: service_healthy }

  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: umami
      POSTGRES_USER: umami
      POSTGRES_PASSWORD: ${UMAMI_DB_PASSWORD}
    volumes:
      - umami_db:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U umami']
      interval: 10s
      timeout: 5s
      retries: 10

volumes:
  umami_db:
```

Secrets: `openssl rand -base64 32 | tr -d '/+='` für beide.

### Erreichbarkeit — entschieden

Der Cloak-Modus (Teil 2) bedeutet: **nur der App-Server** spricht mit Umami,
Server→Server. Der Ingest-Endpunkt muss also **nicht** öffentlich erreichbar
sein — ein echter Gewinn gegenüber dem üblichen Third-Party-Script.

- **UI**: öffentlich als `https://analytics.webcraft-media.de`, TLS am
  zentralen Reverse-Proxy, von dort über WireGuard zur LXC. Dafür Pflicht:
  2FA an, `limit_req` auf `/api/auth/login`.
- **Ingest** (`/api/send`): nur vom App-Host aus über WireGuard. Der
  Reverse-Proxy gibt auf diesem Pfad öffentlich ein 404 zurück.

Dass der Ingest nicht über die öffentliche Subdomain läuft, ist auch der Grund,
warum sie `analytics.` heißen darf: Adblocker-Filterlisten können dort
höchstens das Dashboard treffen, keinen Pageview.

### Retention — umgesetzt

Umami bringt **keine** automatische Löschung mit. Der Monats-Cron liegt in
`infra/umami/setup.sh`; die Löschreihenfolge folgt den Fremdschlüsseln
(Prisma erzeugt `ON DELETE RESTRICT`), Sessions fallen erst, wenn kein
jüngeres Event mehr auf sie zeigt. Tabellennamen sind gegen **v3.4.0**
verifiziert und nach jedem Major neu zu prüfen — das gilt genauso für spätere
Grafana-Queries.

---

## Teil 2 — Nuxt-Binding (Jahrweiser)

### Dateien

| Datei                                        | Was                                                      |
| -------------------------------------------- | -------------------------------------------------------- |
| `app/package.json`                           | `nuxt-umami` in **`dependencies`** (nicht dev!)          |
| `app/nuxt.config.ts`                         | Modul + `umami`-Block + `public.analyticsEnabled`        |
| `app/src/composables/useAnalytics.ts`        | Laufzeit-Gate, Route-Pattern, Opt-out                    |
| `app/src/composables/useAnalytics.spec.ts`   | Tests (Coverage-Schwelle ist 100 %)                      |
| `app/src/plugins/analytics.client.ts`        | hängt sich an `page:finish`                              |
| `app/src/plugins/analytics.client.spec.ts`   | Tests                                                    |
| `app/server/middleware/analytics-gate.ts`    | serverseitiger Off-Switch für `/api/savory`              |
| `app/server/middleware/analytics-gate.spec.ts` | Tests                                                  |
| `app/.env.example`                           | die drei neuen Variablen dokumentiert                    |

`dependencies`, nicht `devDependencies`: `deploy.sh` installiert mit
`npm ci --omit=dev`. Ein Modul in devDependencies fehlt dort beim Build — das ist
genau der Fehlermodus, der schon einmal `dotenv` im pm2-Preload erwischt hat.

### `nuxt.config.ts`

```ts
umami: {
  // Build-Zeit. Änderung erfordert `npm run build`.
  enabled: true,
  host: process.env.UMAMI_HOST || 'http://localhost:3010',
  id: process.env.UMAMI_WEBSITE_ID || '00000000-0000-0000-0000-000000000000',
  proxy: 'cloak',            // Beacons gehen über unsere Nitro-Route
  autoTrack: false,          // wir tracken selbst — siehe Token-Problem
  useDirective: false,       // kein v-umami, bis wir Custom-Events wollen
  excludeQueryParams: true,  // Defense in depth (?ref=, ?token= aus Altlinks)
  ignoreLocalhost: false,    // in dev sollen Events sichtbar landen
  domains: process.env.UMAMI_DOMAINS?.split(',') ?? null,
  logErrors: true,
},
```

Zwei Stolperfallen, beide verifiziert im Modul-Code:

- **`enabled: true` braucht nicht-leere `host` + `id` zur Build-Zeit.** Sonst
  fällt das Modul in den No-op-Modus und registriert die Proxy-Route gar nicht.
  Daher die Platzhalter-Defaults — in Prod stehen die echten Werte in `.env`
  *vor* dem Build.
- **`domains` wirkt auch clientseitig**, verglichen gegen
  `window.location.hostname`. `domains: ['gg-g.info']` schaltet Tracking in
  dev und Preview also stillschweigend ab. Deshalb env-gesteuert. In Prod
  setzen — serverseitig ist es die Origin-Allowlist der Proxy-Route und damit
  der einzige Schutz davor, dass Fremde die Statistik per POST aufblasen.

Dazu in `runtimeConfig.public`:

```ts
public: {
  appVersion,
  // Laufzeit-Kill-Switch. Default aus: die Verdrahtung darf da sein, ohne
  // dass gesendet wird. Umschalten via NUXT_PUBLIC_ANALYTICS_ENABLED=true
  // in app/.env + `pm2 restart jahrweiser-app` — ohne Rebuild.
  analyticsEnabled: process.env.NUXT_PUBLIC_ANALYTICS_ENABLED === 'true',
},
```

### `useAnalytics.ts` — Skizze

```ts
/** Der Opt-out-Schlüssel, den nuxt-umami selbst vor jedem Send prüft. */
const OPT_OUT_KEY = 'umami.disabled'

/**
 * Das gematchte Route-Pattern, nie die konkrete URL: `/login/[token]` und
 * `/register/[token]` tragen ein Secret im Pfad, das nicht in die
 * Analytics-DB gehört. Siehe docu/analytics-umami.md, Teil 0.
 */
function patternOf(route: RouteLocationNormalizedLoaded): string {
  return route.matched.at(-1)?.path ?? route.path
}

export function useAnalytics() {
  const enabled = useRuntimeConfig().public.analyticsEnabled
  // …optedOut / optOut() / optIn() über OPT_OUT_KEY,
  // …trackView() → umTrackView(patternOf(useRoute()))
  // …trackEvent() als dünner Pass-through für später
}
```

Die exakte Gestalt von `matched.at(-1).path` (vue-router liefert für dynamische
Segmente `:token()`) ist mit einem Unit-Test festzunageln — der Test ist die
Doku dieser Zusage, nicht der Kommentar.

### Serverseitiger Off-Switch

`/api/savory` ist ein unauthentifizierter POST-Endpunkt, der zur Build-Zeit
registriert wird — er existiert also auch, wenn Analytics „aus" ist. Ein Gate
nur im Client wäre umgehbar und damit kein Off-Switch im datenschutzrechtlichen
Sinn. Die Middleware antwortet 403, solange `analyticsEnabled` false ist.

### nginx

- `X-Forwarded-For` muss gesetzt sein — das Modul liest die Client-IP per
  `request-ip` und gibt sie an Umami weiter (Umami v2 persistiert sie nicht,
  nutzt sie nur für Geo und Session-Hash).
- `Origin` darf nicht gestrippt werden, sonst 403 aus der Proxy-Route.
- Rate-Limit auf `/api/savory` (`limit_req`), analog zu den anderen
  Schreib-Endpunkten.

---

## Teil 3 — Tests & Gates

Das Projekt fährt `thresholds: { 100: true }`, und `src/**/*.{ts,vue}` ist im
Coverage-`include`. Jede neue Datei braucht ihren Spec.

| Gate                     | Was zu erwarten ist                                     |
| ------------------------ | ------------------------------------------------------- |
| `npm run test:unit`      | neue Specs grün, 100 % gehalten                          |
| `npm run test:lint`      | eslint + typecheck                                       |
| `npm run test:size`      | JS-Limit 240 kB — Modul-Zuwachs ist klein, aber prüfen   |
| `npm run test:baseline`  | Modul-Code darf die Syntax-Untergrenze nicht anheben     |
| `npm run test:e2e`       | Regression: Login/Register laufen weiter                 |

Manuelle Verifikation in dev (Analytics eingeschaltet):

1. `/` laden → ein Pageview in Umami, Pfad `/`.
2. Client-Navigation auf `/karte` → zweiter Pageview. Prüft, dass `page:finish`
   nach der Hydration *und* bei Routenwechseln feuert.
3. Magic-Link öffnen → in Umami steht `/login/:token`, **nicht** der Token.
   Das ist der Test, der zählt.
4. `localStorage.setItem('umami.disabled','1')` → keine weiteren Events.
5. `NUXT_PUBLIC_ANALYTICS_ENABLED=false` + Restart → `/api/savory` gibt 403,
   Client sendet nicht.

---

## Teil 4 — Datenschutz (außerhalb des Repos)

Die Datenschutzerklärung liegt nicht hier, der Footer verlinkt
`webcraft-media.de/#!datenschutz`. **Vor** dem Einschalten dort ergänzen:

- Umami, selbst gehostet, Zweck, Rechtsgrundlage, Retention (13 Monate).
- Was tatsächlich übertragen wird — verifiziert aus dem Modul-Code: Hostname,
  Sprache, **Bildschirmauflösung**, Referrer, Seitentitel, Pfad. Die Auflösung
  ist der Punkt, an dem das „consent-frei"-Argument nach §25 TDDDG angreifbar
  wird; reine Server-Übermittlung ist es nicht mehr.
- Opt-out-Hinweis (der `umami.disabled`-Hebel braucht eine bedienbare Oberfläche
  — kleiner Schalter unter `/settings` wäre der naheliegende Ort).

---

## Offene Entscheidungen (vor dem Start klären)

1. ~~**Netzpfad App→Umami.**~~ Entschieden: WireGuard, intern.
   `UMAMI_HOST=http://<lxc-wg-ip>:3000`. Öffentlich ist nur das Dashboard.
2. ~~**Repo für die geteilte Infrastruktur.**~~ Entschieden: `infra/umami/`
   hier, später herausziehen.
3. **Default nach dem Einschalten: Opt-out oder Opt-in?** Empfehlung Opt-out mit
   aggregiertem, cookielosem Tracking: Umami v2 speichert keine IP, die Session-ID
   ist ein rotierender Hash, damit ist Art. 6(1)(f) gut vertretbar und die
   Auskunfts-/Löschpflicht faktisch gegenstandslos. Opt-in kostet 60–80 % der
   Daten durch Banner-Ermüdung. Kein Rechtsrat — die Auflösungs-Übermittlung aus
   Teil 4 bleibt das Restrisiko.
4. **Server-Kompatibilität `nuxt-umami` ↔ Umami 3.4** — halb geklärt. Gegen
   den Quellcode von v3.4.0 geprüft: der Ingest heißt weiterhin `/api/send`
   und das Zod-Schema akzeptiert unverändert
   `{ type: 'event', payload: { website, hostname, screen, language, title,
   url, referrer } }`. Die v2-Payload des Moduls passt also. Neu und optional
   sind `performance`/`identify` als `type` sowie Web-Vitals-Felder.
5. **Nuxt-4-Kompatibilität**: `nuxt-umami@3.2.1` hängt `@nuxt/kit ^3.15.4` als
   echte Dependency, deklariert aber `compatibility: nuxt >=3`. Bei Nuxt 4.5
   liegt damit ein zweites Kit im Baum. Erwartung: funktioniert. Erster Schritt
   morgen sollte trotzdem `npm i nuxt-umami && npm run build` sein, bevor
   irgendwelcher Code entsteht — wenn das klemmt, ändert sich der ganze Plan
   (Fallback: ~60 Zeilen eigener Beacon-Code gegen `/api/send`, was hier ohnehin
   fast alles ist, was wir vom Modul nutzen).

---

## Reihenfolge für morgen

1. `npm i nuxt-umami` + `npm run build` — Kompatibilität zuerst (~15 min).
2. Umami-Box aufsetzen, Website „Jahrweiser" anlegen, `websiteId` notieren
   (~45 min) — Ablauf steht in [`umami-server.md`](umami-server.md).
3. `nuxt.config.ts` + `.env` + `.env.example` (~20 min).
4. `useAnalytics` + Plugin + Middleware, jeweils mit Spec (~90 min).
5. Manuelle Verifikation Punkte 1–5 aus Teil 3, insbesondere der Token-Test (~30 min).
6. Gates laufen lassen, Doku hier auf Ist-Stand umschreiben (~30 min).

Analytics bleibt dabei bis Schritt 5 lokal aktiv und in Prod **aus**.
