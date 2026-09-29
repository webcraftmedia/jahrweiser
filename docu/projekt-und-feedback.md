# Projekt-Sektion und Feedback

Unter `/projekt` liegt die Sektion, die erklärt, was der Jahrweiser ist, und
über die Mitglieder Rückmeldung geben können. Sie hat einen eigenen Eintrag im
Seitenmenü (Icon-Rail auf dem Desktop, Burger-Menü auf dem Handy) und ein
eigenes Untermenü.

| Route | Inhalt |
|---|---|
| `/projekt/gemeinschaft` | Über GG&G: wofür die Gemeinschaft steht, als reiner Text |
| `/projekt` | Über das Projekt: Zweck, Beteiligte, Technik, Version, Impressum/Datenschutz, Spenden-Platzhalter |
| `/projekt/feedback` | Formular für Feedback, Fehlerberichte und Terminvorschläge |

Die Gemeinschaftsseite steht im Untermenü **vor** der Projektseite: sie
beschreibt, wofür die Software da ist, nicht umgekehrt. Sie beschreibt die
Gemeinschaft von ihrer Idee her — „Gemeinsam Gestalten & Genießen", Abschnitt
für Abschnitt — und benennt bewusst keine Entstehungsgeschichte und keine
Tagespolitik: beides veraltet, die Idee nicht. Der Text liegt vollständig in
`pages.projekt.gemeinschaft.*` in `app/locales/de.json`, die Seite selbst hält
keine Inhalte.

Alle Seiten sind nur eingeloggt erreichbar (`middleware: ['authenticated']`) —
dadurch stammen die Absenderdaten aus der Session und können nicht gefälscht
werden, und das Formular braucht weder Captcha noch IP-Rate-Limit.

Der Menüeintrag kommt aus `app/src/composables/useAppSections.ts`, also aus
derselben Liste, die Icon-Rail und Burger-Menü rendern. Anders als Blättchen und
Telegram ist er an keine Bedingung geknüpft.

## Spenden

Noch nicht umgesetzt. Auf `/projekt` steht dafür ein bewusst als Platzhalter
markierter Abschnitt. Sobald es etwas zu verlinken gibt, wird daraus
`/projekt/spenden` plus ein dritter Eintrag in `menuItems` in
`app/src/pages/projekt.vue` — die Sektion ist dafür gebaut.

## Termine vorschlagen

Auf der Kalenderseite sitzt unten rechts ein runder `+`-Knopf (`.cal-add` in
`app/src/pages/index.vue`), der auf
`/projekt/feedback?kind=event&date=JJJJ-MM-TT` zeigt. Er schreibt **nichts** in
den Kalender: ein Vorschlag ist eine Mail an das Team, das entscheidet und den
Termin anlegt. Deshalb gibt es hier auch keine Kalender-Auswahl und keine
Wiederholungsregel.

Der Knopf gibt den angezeigten Monat mit — den Ersten des Monats, frühestens
aber heute, weil der Kalender auch den Vormonat zeigt und ein Vorschlag mit
Datum in der Vergangenheit niemandem hilft. Das Formular liest `kind` und
`date` aus der Query, wählt die Vorschlags-Variante vor und setzt Beginn auf
19:00 sowie Ende auf zwei Stunden später; eine unplausible Query wird ignoriert,
nicht übernommen.

Er hängt in einem nulltiefen, klebrigen Streifen (`.cal-add-dock`,
`position: sticky`) und damit am unteren Rand des **Scrollbereichs**, nicht am
unteren Rand des Kalenders. Der Unterschied ist auf dem Handy der zwischen
sichtbar und unsichtbar: dort ist die Listenansicht mehrere Bildschirme hoch,
und ein Knopf, zu dem niemand scrollt, ist ein Knopf, den niemand hat. Sticky
statt `fixed`, weil er so im gezoomten Inhaltsbereich bleibt (siehe `useZoom`)
und Fußzeile wie Handy-Icon-Leiste nicht verdeckt — die sind Chrome und stehen
unterhalb des Scrollbereichs.

Weil die Legende am unteren Rand über die volle Breite aufklappt, weicht der
Knopf ihr aus (`.cal-add-raised`, gesteuert vom Computed `legendOpen` — derselbe
Zustand, der die Legende öffnet). Geprüft wird das nicht über die Klasse,
sondern über die Bounding-Boxen im gemockten e2e-Lauf.

### Zeiten ohne Zeitzone

Beginn und Ende sind `<input type="datetime-local">`-Werte und damit *Wandzeit
ohne Zone* (`2026-11-05T19:00`). Sie bleiben das bis in die Mail:
`LOCAL_DATE_TIME_PATTERN` in `app/shared/feedback.ts` validiert die Form,
`formatLocalDateTime()` formatiert rein textuell nach `05.11.2026, 19:00`.
Nirgendwo entsteht daraus ein `Date` — das würde die Zeichenkette als UTC (oder
als Serverzone) lesen und den Termin um den Offset verschieben, aus einer
Chorprobe um 19:00 also eine um 21:00 machen.

Die feste Breite hat einen zweiten Nutzen: zwei solche Werte vergleichen sich
korrekt mit `<`. „Ende vor Beginn" braucht deshalb weder Datumsarithmetik im
Formular noch im Schema. Das Formular sperrt den Absenden-Knopf und sagt es,
zod lehnt es zusätzlich ab (`.refine` auf dem Event-Objekt) — ein
handgeschriebener Request kann dem Team keinen rückwärts laufenden Termin
vorlegen.

## Feedback-Versand

```
GET  /api/feedback   → { enabled: boolean }
POST /api/feedback   → { sent: true }
```

`GET` sagt nur, *ob* Feedback verschickt werden kann; die Zieladresse verlässt
den Server nie. Das Formular fragt vor dem Anzeigen der Textarea — ohne diese
Auskunft würde ein Mitglied erst einen Bericht tippen und dann einen 503 sehen.

`POST` validiert den Body mit zod gegen die Grenzen aus
`app/shared/feedback.ts` (`FEEDBACK_MESSAGE_MAX`, `FEEDBACK_FIELD_MAX`) — als
discriminated union über drei Arten, damit die Regel im Schema steht: ein
Fehlerbericht trägt den technischen Kontext, ein Terminvorschlag trägt den
Termin, reines Feedback trägt keins von beidem. Nur beim Vorschlag darf die
Nachricht leer sein — Titel und Zeit sind der Vorschlag, die Beschreibung
erklärt ihn. Der Endpoint setzt
die E-Mail über `emailRenderer` ab (Template `app/server/emails/feedback/`) und
antwortet:

| Status | Bedeutung |
|---|---|
| `429` | Cooldown — dasselbe Mitglied hat gerade eben schon gesendet |
| `503` | `FEEDBACK_EMAIL` ist nicht gesetzt |
| `500` | SMTP hat zweimal nacheinander abgelehnt |

Absender der Mail ist der Anwendungs-Absender, **Reply-To** ist die Adresse des
Mitglieds: eine Mitglieds-Adresse im `From` würde SPF/DKIM der fremden Domain
verletzen und im Spam landen. Antworten geht trotzdem direkt zurück.

## Welche Daten mitgehen

**Immer** (aus der Session, nicht aus dem Formular): Anzeigename,
E-Mail-Adresse, UID, Rolle, Zeitpunkt.

**Nur beim Terminvorschlag** (aus dem Formular): Titel, Beginn, Ende, Ort.

**Nur beim Fehlerbericht** (aus dem Browser): aufgerufene Seite, App-Version,
User-Agent, Fenstergröße, Hell-/Dunkel-Modus. Eine Idee oder ein Lob wird nicht
nachgestellt — dafür sind diese Angaben zwecklos, und zwecklose Daten werden
nicht erhoben. Das Formular blendet den Block deshalb mit der Auswahl ein und
aus, zod verwirft einen trotzdem mitgeschickten Kontext, und das Mail-Template
druckt die Zeilen nur beim Fehlerbericht.

Der technische Kontext wird im Formular **angezeigt** (aufklappbarer Block
„Diese Daten werden mitgesendet“). Deshalb nimmt der Server auch die Angaben des
Clients entgegen, statt die Request-Header auszulesen: gesendet wird genau das,
was vorher zu sehen war. Die betroffene Seite kommt aus dem History-Eintrag
(`window.history.state.back`) und ist kein Eingabefeld — wer eine Route
abtippen soll, tippt die falsche. Die IP-Adresse wird nicht erfasst.

Die Nachricht und alle Kontextwerte werden im Pug-Template mit `=` ausgegeben
(escaped), nie mit `!=` — sonst würde selbst geschriebener HTML-Code im
Mailclient der Empfänger gerendert. `app/server/emails/feedback.render.spec.ts`
rendert das Template echt und prüft genau das.

## Konfiguration

| Variable | Default | Zweck |
|---|---|---|
| `FEEDBACK_EMAIL` | `feedback@example.com` in Entwicklung/Test, **leer in Produktion** | Zieladresse. Leer = Formular wird nicht angeboten |
| `FEEDBACK_RATE_LIMIT_MS` | `60000` | Cooldown je Mitglied; `0` schaltet ihn ab (e2e) |

`FEEDBACK_EMAIL` ist absichtlich kein `public`-Wert: über `runtimeConfig.public`
läge die Adresse im Client-Bundle und wäre für jeden auslesbar. Der
Entwicklungs-Default zeigt auf den maildev-Posteingang des docker-compose-Stacks
— in Produktion bleibt der Default leer, damit niemand unbemerkt in ein
nicht existierendes Postfach sendet.

Der Cooldown liegt in einer Map im Prozess, nicht in der Datenbank — dieselbe
Abwägung wie beim Login-Cooldown (`app/server/helpers/loginCooldown.ts`): das
Fenster ist eine Minute, ein Neustart kostet also höchstens eine Extra-Mail. Er
startet erst *nach* erfolgreichem Versand, damit ein fehlgeschlagener Versuch
niemanden eine Minute lang aussperrt.

## Tests

| Datei | Prüft |
|---|---|
| `app/server/api/feedback.post.spec.ts` | Validierung, Cooldown, Reply-To, Header-Injection, Retry, Termin ohne Zeitzonen-Verschiebung |
| `app/server/api/feedback.get.spec.ts` | Verfügbarkeit, und dass die Adresse nicht herausgegeben wird |
| `app/server/emails/feedback.render.spec.ts` | echtes Rendern des Templates samt Escaping |
| `app/src/pages/projekt/feedback.spec.ts` | Formular, Kontextanzeige, Fehlerfälle (429/503/sonstige) |
| `app/src/pages/projekt/index.spec.ts`, `app/src/pages/projekt.spec.ts` | Inhalte und Untermenü |
| `app/src/pages/projekt/gemeinschaft.spec.ts` | Vollständigkeit der Abschnitte |
| `app/shared/feedback.spec.ts` | Datum/Zeit-Format, Verschiebung über Tages-, Monats- und DST-Grenzen |
| `app/src/pages/index.spec.ts` | `+`-Knopf: Ziel-Link, Monatsübernahme, Ausweichen vor der Legende |
| `app/e2e/suggest-event.spec.ts` | echter Browser: Vorbelegung, gesendeter Payload — und per Bounding-Box, dass Knopf und Legende sich nicht überlappen |
| `app/e2e-full-stack/feedback.spec.ts` | echte Mail in maildev für alle drei Arten: Betreff, Inhalt, und dass nicht mitgeht, was nicht mitgehen soll |

Die Geometrie ist bewusst im gemockten e2e-Lauf geprüft und nicht im Unit-Test:
dass die Klasse `cal-add-raised` gesetzt wird, sagt nichts darüber, ob der Knopf
der Legende tatsächlich ausweicht — das zeigt nur eine gelayoutete Seite.
