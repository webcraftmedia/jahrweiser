# Projekt-Sektion und Feedback

Unter `/projekt` liegt die Sektion, die erklärt, was der Jahrweiser ist, und
über die Mitglieder Rückmeldung geben können. Sie hat einen eigenen Eintrag im
Seitenmenü (Icon-Rail auf dem Desktop, Burger-Menü auf dem Handy) und ein
eigenes Untermenü.

| Route | Inhalt |
|---|---|
| `/projekt` | Über das Projekt: Zweck, Beteiligte, Technik, Version, Impressum/Datenschutz, Spenden-Platzhalter |
| `/projekt/feedback` | Formular für Feedback und Fehlerberichte |

Beide Seiten sind nur eingeloggt erreichbar (`middleware: ['authenticated']`) —
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

## Feedback-Versand

```
GET  /api/feedback   → { enabled: boolean }
POST /api/feedback   → { sent: true }
```

`GET` sagt nur, *ob* Feedback verschickt werden kann; die Zieladresse verlässt
den Server nie. Das Formular fragt vor dem Anzeigen der Textarea — ohne diese
Auskunft würde ein Mitglied erst einen Bericht tippen und dann einen 503 sehen.

`POST` validiert den Body mit zod gegen die Grenzen aus
`app/shared/feedback.ts` (`FEEDBACK_MESSAGE_MAX`, `FEEDBACK_FIELD_MAX`), setzt
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

Aus der Session (nicht aus dem Formular): Anzeigename, E-Mail-Adresse, UID,
Rolle. Aus dem Browser: aufgerufene Seite, App-Version, User-Agent,
Fenstergröße, Hell-/Dunkel-Modus.

Der technische Kontext wird im Formular **angezeigt** (aufklappbarer Block
„Diese Daten werden mitgesendet“), und die Seite ist editierbar. Deshalb nimmt
der Server auch die Angaben des Clients entgegen, statt die Request-Header
auszulesen: gesendet wird genau das, was vorher zu sehen war. Die IP-Adresse
wird nicht erfasst.

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
| `app/server/api/feedback.post.spec.ts` | Validierung, Cooldown, Reply-To, Header-Injection, Retry |
| `app/server/api/feedback.get.spec.ts` | Verfügbarkeit, und dass die Adresse nicht herausgegeben wird |
| `app/server/emails/feedback.render.spec.ts` | echtes Rendern des Templates samt Escaping |
| `app/src/pages/projekt/feedback.spec.ts` | Formular, Kontextanzeige, Fehlerfälle (429/503/sonstige) |
| `app/src/pages/projekt/index.spec.ts`, `app/src/pages/projekt.spec.ts` | Inhalte und Untermenü |
