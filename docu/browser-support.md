# Welche Browser der Jahrweiser unterstützt — und warum das geprüft wird

Maßgeblich ist `app/.browserslistrc`. Stand heute:

|               | ab Version | erschienen     |
| ------------- | ---------- | -------------- |
| Chrome / Edge | 80         | Februar 2020   |
| Firefox       | 72         | Januar 2020    |
| Safari / iOS  | 14         | September 2020 |

Alles darunter kann die Seite **nicht** laden. Das ist keine Nachlässigkeit,
sondern die Untergrenze dessen, was ein Modul-Bundle ausdrücken kann (siehe
„Warum nicht tiefer").

## Das Problem, das dahintersteckt

Vite 8 baut standardmäßig für `baseline-widely-available` — Safari 16, Chrome
107, also Baujahr 2022/23. Zwei Dependencies liefern ES2022-Klassenfelder aus,
und damit ist der Entry-Chunk auf allem Älteren ein **SyntaxError**.

Ein SyntaxError passiert, bevor eine einzige Zeile unseres Codes läuft. Es gibt
deshalb nichts, was ihn melden könnte:

- der Server liefert brav 200,
- das serverseitig gerenderte HTML steht da und bleibt stehen,
- die Deadline aus `src/utils/withTimeout.ts` hilft nicht — sie steckt in genau
  dem Bundle, das nicht startet.

Auf `/register` heißt das: **drei Punkte, die nie weggehen.** Auf `/login`: ein
Bestätigungsknopf, der dauerhaft ausgegraut bleibt (`:disabled="!hydrated"`).
Im September 2026 hat das ein Mitglied eine Woche lang nicht registrieren
können, und weder Log noch Monitoring haben etwas davon gewusst.

## Die drei Teile, die zusammenpassen müssen

| Datei                                      | Rolle                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `app/.browserslistrc`                      | die Quelle der Wahrheit — hier und nur hier wird die Grenze verschoben |
| `app/nuxt.config.ts` → `vite.build.target` | welche **Syntax** ausgegeben wird                                      |
| `app/public/polyfills.js`                  | welche **Runtime-APIs** nachgereicht werden                            |
| `app/scripts/browser-baseline.mjs`         | prüft nach jedem Build, dass die drei noch übereinstimmen              |

### Syntax vs. Runtime — der Unterschied entscheidet

Das ist die Unterscheidung, an der die erste Analyse fast gescheitert wäre:

- **Syntax** (Klassenfelder, `??=`, BigInt-Literale wie `32n`) lässt sich
  **nicht** polyfillen. Der Browser parst die Datei nicht, Ende. Dagegen hilft
  nur `vite.build.target` — oder die Grenze anheben.
- **Runtime-APIs** (`.at()`, `Object.hasOwn`, `toSorted`) lassen sich
  nachreichen. Dafür ist `public/polyfills.js` da.

Deshalb liegt der Boden bei Safari **14** und nicht bei 13.1: eine
Hash-Funktion im Dependency-Baum schreibt das BigInt-Literal `32n`, und BigInt
kam erst mit Safari 14. rolldown sagt das als
`TOLERATED_TRANSFORM: Big integer literals are not available` — eine Warnung,
die in 200 Zeilen Build-Log untergeht. Der Baseline-Check sucht sie gezielt.

### Warum die Polyfills von Hand geschrieben sind

Es sind sechs APIs, zusammen ~1,1 kB brotli. Die Alternative wäre
`@vitejs/plugin-legacy` mit `modernPolyfills` (core-js + Babel, automatische
Erkennung). Dagegen sprach:

- das JS-Budget lag vor dieser Änderung bei 234,96 kB von 235 kB erlaubten —
  ein core-js-Chunk hätte es gesprengt,
- ~100 zusätzliche Pakete Angriffsfläche für sechs Funktionen,
- die Modern-Target-Polyfills von plugin-legacy sind laut
  [vitejs/vite#21014](https://github.com/vitejs/vite/issues/21014) selbst noch
  Baustelle.

Handarbeit ist nur deshalb vertretbar, weil der Baseline-Check sie kontrolliert
— er führt die Polyfills in einer VM ohne die nativen Funktionen aus und prüft
ihr **Verhalten**, nicht ihre Anwesenheit. Fällt diese Kontrolle weg, ist
`plugin-legacy` die bessere Wahl.

Falls doch umgestellt wird: `@teages/nuxt-legacy@3` bindet plugin-legacy 8 an
Nuxt ≥ 4.5 an. `renderLegacyChunks: false` genügt — den nomodule-Zweig brauchen
wir nicht, unser Boden kennt ES-Module bereits.

## Der Check

```sh
cd app
npm run build          # der Check liest .output/public/_nuxt
npm run test:baseline
```

In CI hängt er als Schritt „Frontend | Browser Baseline" am Job `Build - App`.
Er prüft vier Dinge:

1. `.browserslistrc` und `vite.build.target` beschreiben dieselbe Grenze,
2. kein Chunk braucht Syntax oberhalb von ES2020,
3. keine Syntax, die zwar ES2020 ist, aber jünger als der Boden (BigInt),
4. jede Runtime-API oberhalb des Bodens ist durch ein **funktionierendes**
   Polyfill gedeckt — und keins ist überflüssig (das meldet er als `note`).

### Wenn er rot wird

- **„needs syntax newer than ES2020"** → eine Dependency ist modernisiert
  worden. Entweder Dependency ersetzen oder den Boden in `.browserslistrc`
  anheben (und dann `ES_LEVEL` im Script mitziehen).
- **„does not supply a working one"** → eine neue API ist im Bundle
  gelandet. In `public/polyfills.js` ergänzen; das Script nennt die Stelle.
- **„Syntax cannot be polyfilled"** → nur über den Boden lösbar.

## Warum nicht tiefer als ES2020

Unterhalb von ES2020 kann ein Modul-Build `import.meta` und dynamisches
`import()` nicht mehr abbilden. Der nächste Schritt wäre ein zweites
nomodule-Bundle über `@vitejs/plugin-legacy` — doppelter Build, core-js,
SystemJS. Browser ganz ohne ES-Module (IE 11, Safari ≤ 10, Android-WebView
≤ 60) laden die App ohnehin bei keinem Target.

## Was übrig bleibt: `BootFallback`

Ein zu alter Browser ist nur eine von mehreren Arten, wie das Bundle nicht
startet — Content-Blocker, Firmen-Proxy und kaputte Erweiterungen sehen von
außen identisch aus, und keine davon lässt sich wegkonfigurieren.

`src/components/BootFallback.vue` hängt im Login-Layout und macht daraus
wenigstens eine Aussage: ein serverseitig gerenderter, versteckter Kasten und
ein klassisches `<script>`, das ihn 1,5 s nach `load` aufdeckt, falls die App
bis dahin kein `window.__jwMounted` gesetzt hat. Zusätzlich ein `<noscript>`
für den Fall, dass gar kein Skript läuft.

Damit sieht ein Mitglied „Diese Seite konnte nicht geladen werden" statt drei
Punkten — und kann berichten, was los ist.
