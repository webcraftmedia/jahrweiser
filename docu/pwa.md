# Der Jahrweiser als App (PWA)

Auf Handy und Tablet lässt sich der Jahrweiser auf den Startbildschirm legen und
startet dann wie eine App: eigenes Symbol, ohne Adressleiste. Dieses Dokument
beschreibt, wer welchen Code bekommt, was zwischengespeichert wird und was nie,
wie Updates ankommen und wie man im Notfall alles wieder abschaltet.

Grundlage ist `@vite-pwa/nuxt` (Workbox, Strategie `generateSW`). Konfiguration:
`app/nuxt.config.ts` → `pwa`.

## Drei Arten, den Jahrweiser zu benutzen

Wer was bekommt, entscheidet `src/plugins/pwa.client.ts` mit Hilfe von
`src/utils/device.ts` (`pwaMode()`), gleich beim Start im Browser:

|                                        | Manifest-Link | Installations-Hinweis |  Service Worker  |
| -------------------------------------- | :-----------: | :-------------------: | :--------------: |
| **Desktop-Browser**                    |       –       |           –           |        –         |
| **Handy-/Tablet-Browser**              |       ✓       |   ✓ (lazy geladen)    |        –         |
| **Installierte App** (Startbildschirm) |       ✓       |           –           | ✓ (lazy geladen) |

- **Desktop:** bekommt nichts. Ohne `<link rel="manifest">` zeigen Chrome und
  Edge keinen Installieren-Knopf in der Adressleiste — die App ist für den
  Desktop nicht gedacht. Ins Entry-Bundle kommen nur die Geräteerkennung und
  der kleine Zustand für das Installations-Ereignis (+0,8 kB brotli, gemessen
  124,3 → 125,1 kB für Entry samt statischer Imports); Hinweis und
  Service-Worker-Registrierung sind eigene Chunks, die ein Desktop-Browser nie
  lädt.
- **Handy-Browser:** Manifest und Installations-Hinweis, aber **kein** Service
  Worker. Dessen Precache wären einige hundert Kilobyte über mobile Daten — für
  alle, die nie installieren, umsonst. Für die Installierbarkeit braucht es ihn
  nicht: iOS hat nie einen verlangt, und Chromium feuert `beforeinstallprompt`
  heute auch ohne (geprüft mit Chromium 153; siehe „Grenzen").
- **Installierte App:** erkannt an `display-mode: standalone` bzw. iOS'
  `navigator.standalone`. Erst hier wird der Service Worker registriert und
  lädt den vollständigen Precache — „viel auf einmal", dafür ist die App danach
  schnell und zeigt offline einen Hinweis statt einer Browser-Fehlerseite.
  Der Manifest-Link bleibt, weil Android ihn beim Start liest, um die
  installierte App zu aktualisieren.

### Geräteerkennung und ihre Grenzen

`isMobileDevice()` fragt zuerst die User-Agent Client Hints (nur Chromium):
`mobile: true` oder Plattform `Android`/`iOS` — Letzteres erwischt auch
Android-Tablets, die `mobile: false` melden. Ohne Client Hints (Safari,
Firefox) entscheidet der User-Agent (`Android|iPhone|iPad|iPod|Mobile|…`).
iPadOS-Safari gibt sich als Mac aus; ein „Mac" mit mehreren Touchpunkten und
grobem Zeiger (`pointer: coarse`) gilt deshalb als iPad.

Bekannte Fehlgriffe — alle harmlos, schlimmstenfalls fehlt ein Angebot oder
erscheint eins zu viel, kaputt geht nichts:

- **„Desktop-Website anfordern"** auf dem Handy: Der Browser gibt sich als
  Desktop aus, das Handy bekommt keinen Manifest-Link.
- **Windows-Tablets, Chromebooks mit Touch:** gelten als Desktop.
- **Desktop-Chrome „Seite als App installieren"** (Menü → Streamen, speichern,
  teilen) funktioniert auch ohne Manifest. Wer das tut, bekommt danach in
  diesem Fenster den Modus „installiert", also auch den Service Worker.

## Was zwischengespeichert wird — und was nie

Nur in der installierten App, durch den Service Worker:

| Inhalt                                                    | Wie                                                                                             | Warum                                                                                                                                                                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/_nuxt/*.js`, `/_nuxt/*.css`                             | Precache                                                                                        | gehasht, also unveränderlich — sicher zu cachen                                                                                                                                                       |
| `*.woff2` (Schriften)                                     | Precache                                                                                        | selbst gehostet (Fontsource), nur Latin und Latin-ext                                                                                                                                                 |
| `/pwa/*.png` (Symbole)                                    | Precache                                                                                        | für die Offline-Seite und das Manifest                                                                                                                                                                |
| `/offline.html`                                           | Precache                                                                                        | die Offline-Seite selbst                                                                                                                                                                              |
| `/manifest.webmanifest`                                   | Precache                                                                                        | von vite-plugin-pwa immer mitgenommen                                                                                                                                                                 |
| **Kalender-Seiten** (`/`, `/2026/10`, `/2026/10/event/…`) | NetworkFirst (5 s), Cache `jahrweiser-pages`, höchstens 12 Seiten; ohne Treffer `/offline.html` | für den Offline-Kalender (unten). Enthält den Namen des Mitglieds — die App löscht den Cache bei Logout, 401, Mitgliederwechsel und Ablauf                                                            |
| **übrige HTML-Seiten**                                    | **nie** — NetworkOnly, bei Netzfehler `/offline.html`                                           | serverseitig gerendertes HTML enthält personenbezogene Daten (Name, Termine, Mitgliederdaten)                                                                                                         |
| **`/api/*`**                                              | **nie** vom Service Worker — nicht einmal angefasst                                             | ein zwischengespeicherter API-Response läge im Browser-Cache, ohne dass die App ihn einem Mitglied zuordnen oder gezielt löschen könnte. Die Kalenderdaten für offline legt die App selbst ab (unten) |
| `/_nuxt/builds/*`                                         | nie                                                                                             | Nuxts Build-Manifest wird mit Cache-Buster-Query geholt, der Precache träfe es ohnehin nicht                                                                                                          |
| `/admin/cal/*`                                            | nie                                                                                             | CalDavZAP, eine eigene Anwendung auf demselben Origin (siehe unten)                                                                                                                                   |

Precache heute: **74 Einträge, ~985 KiB roh, ~357 KiB gzip** (Stand
Einführung). Darin sind alle Routen-Chunks, auch die des Admin-Bereichs — sie
herauszurechnen wäre Handarbeit an gehashten Dateinamen, und knapp 360 KB einmal
pro Deploy sind für eine installierte App vertretbar. Wirklich große, selten
gebrauchte Daten gibt es im Client-Bundle nicht: die Kartengeometrie kommt über
`/api` und wird damit nie gecacht. `sw.js` selbst: ~5,6 kB brotli
(`app/.size-limit.json`, Grenze 9 kB; seit dem Offline-Kalender ~8 kB, weil
Workbox' Ablauf-Plugin für den Seiten-Cache eine eigene IndexedDB-Schicht
mitbringt).

Seitenaufrufe (Navigationen) gehen also immer zuerst ans Netz. Nur wenn das scheitert,
antwortet der Service Worker mit der vorab gespeicherten Offline-Seite — die
Adresse bleibt dabei die aufgerufene, „Erneut versuchen" lädt also genau die
Seite, die das Mitglied wollte; wird das Gerät wieder online, lädt die Seite
von selbst neu. Navigation Preload ist an, damit der Weg über den Service
Worker keinen zusätzlichen Roundtrip kostet.

Ausgenommen von jeder Behandlung sind Navigationen nach `/api/` (etwa ein
direkt geöffnetes Blättchen-PDF) und nach `/admin/cal/`.

## Kalender offline

Die installierte App zeigt den Kalender auch ohne Netz — **so lange, wie der
Server das Mitglied noch hereinließe**, und nur dem Mitglied, dem die Daten
gehören. Nur in der installierten App; Desktop und Handy-Browser speichern
nichts und laden den Code dafür nicht.

**Was auf dem Gerät liegt** (IndexedDB `jahrweiser-offline`, je Eintrag mit der
UID des Mitglieds):

- die Kalenderliste,
- die Termine jedes angesehenen Monats **und des Monats danach** (vorab geladen,
  einmal pro Monat und Seitenaufruf),
- die Details jedes geöffneten Termins,
- dazu die Kalender-Seiten selbst im Cache `jahrweiser-pages` (siehe Tabelle).

**Warum IndexedDB und nicht der Service Worker:** Der Kalender wird per POST
gelesen, mit Kalender, Termin-ID und Datum im Body. Als GET stünden sie in der
URL und damit samt IP im nginx-Access-Log — wer wann welchen Termin geöffnet
hat. Die Cache-API speichert aber nur GET. Also legt die App die Antworten
selbst ab (`app/src/utils/offlineData.ts`), getrennt nach Mitglied.

**Wie lange:** Das Login-Cookie hilft hier nicht — es ist `httpOnly`, versiegelt
und lebt 90 Tage, egal wie lange die Sitzung wirklich gilt. Der Server schickt
deshalb mit jeder angemeldeten Antwort die **Restlaufzeit in Sekunden** mit
(`X-Session-Expires-In`, `app/server/middleware/session-check.ts`). Die App
rechnet daraus mit der eigenen Uhr einen Ablaufzeitpunkt und merkt ihn sich
mit der UID (`localStorage`, `jahrweiser-offline-session`). Online rutscht er
mit jeder Anfrage mit — wie die Sitzung selbst: 7 Tage nach der letzten
Aktivität, höchstens 90 Tage nach dem Login. Eine Dauer statt eines Datums,
damit eine falsch gehende Geräte-Uhr die Frist nicht verschiebt.

**Offline** liefert der Kalender, was gespeichert ist, und sagt es: „Offline –
du siehst den Stand vom …". Eine Ablehnung des Servers (401, 403, 404) wird nie
durch Gespeichertes überdeckt — eine 401 führt wie bisher zum Logout.

**Gelöscht wird alles** (Daten, Seiten-Cache, Ablaufzeitpunkt):

| Wann                                  | Wo                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Logout                                | `Header.vue` — vor dem Beenden der Sitzung                             |
| jede 401                              | `plugins/auth-redirect.ts`                                             |
| ein anderes Mitglied meldet sich an   | `utils/offlineSession.ts` (UID-Wechsel beim Header)                    |
| Start ohne Netz nach Ablauf der Frist | `plugins/pwa.client.ts` — danach Login, offline also die Offline-Seite |

Das Löschen läuft in jedem Modus, nicht nur in der App: Auf Android teilen sich
App und Chrome Speicher und Service Worker, ein Logout im Chrome-Tab muss also
auch die Daten der App entfernen.

**Grenzen:**

- Beendet ein Admin die Sitzung, während das Gerät offline ist, bleibt der
  Kalender bis zur Frist oder bis zum nächsten Kontakt mit dem Server lesbar —
  dann kommt die 401 und alles wird gelöscht.
- Nicht geöffnete Termine haben offline keine Details; ihr Titel steht im
  Kalender, das Detailfenster schließt sich wieder.
- Monate, die weder angesehen noch vorab geladen wurden, bleiben offline leer.
- Ohne Netz meldet Nuxt beim Start einen Fehler `NUXT_E5002` in der Konsole
  (das Build-Manifest unter `/_nuxt/builds/` ist nicht gecacht, siehe Tabelle).
  Folgenlos für die Anzeige.

### Hinweis zu Android

Auf Android teilen sich die installierte App und Chrome denselben Speicher.
Hat die App einmal ihren Service Worker registriert, kontrolliert er auch
Chrome-Tabs auf gg-g.info: dort gibt es dann ebenfalls die Offline-Seite, den
Precache und den Seiten-Cache der Kalender-Seiten. Deshalb löscht ein Logout
auch im Chrome-Tab, was die App für offline abgelegt hat (siehe „Kalender
offline").
Auf iOS haben Startbildschirm-Apps einen eigenen, getrennten Speicher.

### CalDavZAP (`/admin/cal/`)

Das Adressbuch unter `/admin/` wird von nginx direkt ausgeliefert, liegt aber
auf demselben Origin und damit im Scope `/` des Service Workers. Der Service
Worker fasst diese Pfade nicht an (keine Route passt, also geht alles am
Service Worker vorbei ans Netz); offline zeigt CalDavZAP deshalb die normale
Browser-Fehlerseite und nicht unsere Offline-Seite.

## Updates

`registerType: 'autoUpdate'` mit `skipWaiting` + `clientsClaim` +
`cleanupOutdatedCaches`: Nach einem Deploy holt der Browser beim nächsten
Seitenaufruf die neue `sw.js`, installiert sie, und sie übernimmt sofort; alte
Precache-Einträge werden gelöscht.

Die Registrierung schreiben wir selbst (`src/utils/serviceWorker.ts`) statt das
Plugin des Moduls zu nutzen: Das lädt bei jedem Update alle offenen Tabs neu —
ein halb ausgefülltes Feedback-Formular wäre weg. Nötig ist der Reload nicht:
HTML kommt immer frisch vom Server und verweist auf die neuen Chunks, die der
alte Precache gar nicht kennt und deshalb aus dem Netz holt. Ein lange offener
Tab, der nach dem Deploy einen alten Chunk nachlädt, bekommt wie ohne Service
Worker einen 404 — Nuxt lädt die Seite dann selbst neu.

`sw.js`, `manifest.webmanifest` und `offline.html` kommen mit
`Cache-Control: no-cache` (`server/plugins/pwa-headers.ts`). Ohne das könnte ein
HTTP-Cache eine alte `sw.js` festhalten und damit Updates — und den Notschalter
unten — bis zu 24 Stunden aufhalten. Gesetzt wird das im Nitro-Hook `request`,
nicht über `routeRules`: Nuxt kompiliert Route-Rules in das Client-Bundle, und
das hätte jeden Desktop-Besucher Bytes für drei Server-Header gekostet.

nginx reicht nur per `proxy_pass` an Nitro durch (siehe `README.md`) und
übernimmt die Header unverändert. Sollte dort je ein `proxy_cache` oder ein
`expires` für `/` dazukommen, braucht es eine Ausnahme:

```nginx
location = /sw.js {
    proxy_pass http://127.0.0.1:3000;
    add_header Cache-Control "no-cache" always;
    proxy_no_cache 1;
    proxy_cache_bypass 1;
}
```

## Notschalter: Service Worker abschalten

Wenn der Service Worker etwas kaputt macht, reicht ein gewöhnliches Deploy
eventuell nicht. Dafür gibt es einen Schalter:

1. In `app/.env` setzen: `PWA_KILL_SWITCH=true`
2. Deployen (`.github/webhooks/deploy.sh` baut neu — der Schalter wirkt beim Build).

Dann passiert zweierlei (`app/nuxt.config.ts`, `pwaKillSwitch`):

- `sw.js` wird als **selbstzerstörender** Service Worker gebaut
  (`selfDestroying` von vite-plugin-pwa): Er löscht beim Aktivieren alle
  Caches, meldet sich ab und lädt die offenen Fenster neu.
- Die App registriert keinen neuen Service Worker mehr
  (`runtimeConfig.public.serviceWorker = false`). Sonst würde der
  selbstzerstörende nach jedem Neuladen wieder registriert — eine Schleife.

Ankommen tut das ohne Zutun der Mitglieder: Der Browser prüft `sw.js` bei jedem
Seitenaufruf der installierten App auf Änderungen, und weil `sw.js` mit
`no-cache` ausgeliefert wird, sieht er die neue sofort. Danach läuft die
installierte App wie der Handy-Browser — ohne Service Worker und ohne
Offline-Seite. Zum Wiedereinschalten die Zeile entfernen und erneut deployen.

## Installations-Hinweis

`src/components/InstallHint.vue`, eingebunden im Default-Layout über der
unteren Leiste (`<LazyInstallHint>` — ein eigener Chunk, nur im Handy-Browser
geladen) und nur für angemeldete Mitglieder. Je nach Browser
(`src/composables/useInstallHint.ts`):

| Browser                                                                  | Hinweis                                                                                                                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android Chrome, Edge, Samsung Internet                                   | Knopf „Installieren", öffnet den Installationsdialog (`beforeinstallprompt`). Erscheint erst, wenn der Browser das Ereignis schickt — bei schon installierter App also nie. |
| Android Firefox u. a. ohne Ereignis                                      | „im Browser-Menü ‚Zum Startbildschirm hinzufügen'"                                                                                                                          |
| iOS Safari, andere iOS-Browser ab 16.4                                   | „Tippe auf ‚Teilen' und dann auf ‚Zum Home-Bildschirm'"                                                                                                                     |
| iOS-Browser vor 16.4, In-App-Browser (Instagram, Facebook, Google-App …) | „Öffne diese Seite in Safari …"                                                                                                                                             |

Das `beforeinstallprompt`-Ereignis kommt einmal kurz nach dem Laden. Es wird
deshalb schon im Plugin abgefangen (`src/utils/installPrompt.ts`), nicht erst
im Hinweis, der oft später lädt.

**Wie oft er kommt:** Das ✕ lässt den Hinweis 30 Tage ruhen; danach bietet
sich die App erneut an — **höchstens dreimal**, nach dem dritten ✕ nie wieder
(`localStorage: jahrweiser-install-hint-dismissed`, `{ count, until }`; Werte in
`useInstallHint.ts`). Ist der Speicher gesperrt, erscheint er beim nächsten
Besuch wieder.

**Der Weg zurück**, unabhängig davon, wie oft weggeklickt wurde — nur im
Handy-/Tablet-Browser:

- **Menü → „Als App installieren"** (Kopfleiste),
- **Projekt-Seite, Abschnitt „Den Jahrweiser als App"** — dort steht in der
  installierten App, dass sie schon installiert ist, und am Desktop, dass es
  auf dem Handy geht.

Beide öffnen auf Android den Installationsdialog direkt (das Ereignis wird ja
schon beim Laden gemerkt) und zeigen sonst den Hinweis mit den Schritten für
diesen Browser. Ihn dann zu schließen zählt nicht als Wegklicken — es war die
Frage des Mitglieds, kein Angebot der App.

Daneben geht es immer über das Browser-Menü bzw. „Teilen → Zum Home-Bildschirm".

## Symbole

Quelle ist `app/assets/logo-small.svg` (rundes Logo). `npm run pwa:icons`
(`app/scripts/pwa-icons.mjs`, braucht `rsvg-convert` und `magick`) erzeugt
daraus ein **vollflächiges** Quadrat: Pfirsich (`#ffe0c6`) bis an den Rand,
Kreis und dessen Schatten entfernt, die Buchstaben vermessen und so skaliert,
dass sie im Safe-Zone-Kreis (80 % Durchmesser) liegen. Damit übersteht das
Symbol jede Maske — iOS' abgerundetes Quadrat, Androids Kreis, Squircle,
Tropfen. Ergebnis: `public/pwa/icon-192.<hash>.png`, `icon-512.<hash>.png`
(`any` und `maskable`), `apple-touch-icon.<hash>.png` (180) und der Index
`assets/pwa-icons.json`, den `nuxt.config.ts` liest. Die Dateien werden
eingecheckt; das Skript läuft nur, wenn sich das Logo ändert. `favicon.ico`
bleibt das runde Logo — im Browser-Tab gibt es keine Maske.

Der Hash im Dateinamen ist der Cache-Buster: installierte Apps merken sich eine
Symbol-URL. Trotzdem gilt:

- **Android** prüft das Manifest beim Start der App und übernimmt ein neues
  Symbol mit Verzögerung (bis zu einem Tag); je nach Chrome-Version fragt es
  das Mitglied vorher in einem Dialog.
- **iOS** aktualisiert ein Startbildschirm-Symbol **nie**. Wer das neue Symbol
  will, muss die App vom Startbildschirm löschen und neu hinzufügen.

## Grenzen

- **`beforeinstallprompt` ohne Service Worker** wurde mit Chromium 153 (Desktop,
  frisches Profil, `--bypass-app-banner-engagement-checks`) nachgeprüft: das
  Ereignis kommt mit und ohne Service Worker. Auf einem echten Android-Gerät
  steht die Bestätigung noch aus. Bliebe es dort aus, wäre der Ausweg ein
  Service Worker im Handy-Browser mit minimalem Precache (nur `offline.html`).
- **`theme-color`** folgt `prefers-color-scheme` des Systems. Wer im Jahrweiser
  den Dunkelmodus gegen die Systemeinstellung umschaltet, hat eine
  Statusleiste in der „falschen" Farbe.
- Der Browser-Baseline-Check (`npm run test:baseline`) prüft nur `/_nuxt/`.
  `sw.js` läuft ohnehin nur in Browsern mit Service Worker und parst als ES2020.

## Lokal testen

Im Entwicklungsmodus gibt es keinen Service Worker (`devOptions.enabled:
false`) — ein Service Worker in `npm run dev` würde gestrige Bundles zu heutigem
Code ausliefern.

```sh
cd app
npm run build
PORT=3012 node .output/server/index.mjs   # oder: npm run preview
```

Dann in Chrome:

- **Handy-Modus:** DevTools → Device Toolbar (Strg+Umschalt+M), ein Handy wählen,
  neu laden. Im Elements-Tab steht `<link rel="manifest">`; DevTools →
  Application → Manifest zeigt Manifest, Symbole und Installierbarkeit.
  Application → Service workers bleibt leer.
- **Installierte App:** Im Handy-Modus unter Application → Manifest auf
  „Install" klicken (oder ein Android-Gerät per USB über `chrome://inspect`
  anschließen und dort installieren). Das App-Fenster läuft in
  `display-mode: standalone` und registriert den Service Worker: Application →
  Service workers zeigt `sw.js`, Cache storage den Precache; Network →
  „Offline" und neu laden zeigt die Offline-Seite.
- **Notschalter / Neustart:** Application → Storage → „Clear site data".

Automatisch geprüft wird das in `app/e2e/pwa.spec.ts` (Playwright gegen den
Produktions-Build): kein Manifest auf dem Desktop, Manifest ohne Service Worker
im Handy-Browser, Hinweis auf dem iPhone samt dauerhaftem Ausblenden, und in
der installierten App (simuliert über `navigator.standalone`) Service Worker,
Precache ohne eine einzige Seite und die Offline-Seite bei `setOffline(true)`.
