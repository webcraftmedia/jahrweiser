# Wöchentlicher Newsletter

Jeden Sonntag um 18:00 Uhr versendet ein Cron-Job eine Übersicht aller Termine
der kommenden Woche an alle berechtigten Nutzer. Jeder Termin verlinkt direkt
auf die Detailansicht in der App.

## Opt-in / Opt-out Phasen

Der Newsletter kennt zwei Phasen, gesteuert über die Env-Var
`NEWSLETTER_DEFAULT_OPT_IN`:

| Phase | `NEWSLETTER_DEFAULT_OPT_IN` | Empfänger |
|---|---|---|
| 1 (initial) | leer / `false` | Nur Nutzer mit `newsletter_subscribed = 'subscribed'` |
| 2 (später)  | `true`         | Alle aktiven Nutzer, AUSSER `newsletter_subscribed = 'unsubscribed'` |

Beim Umstellen auf Phase 2 wird *kein* Datenbank-Migrationsschritt nötig — das
Audience-Filter im Send-Endpoint wertet die Env-Var bei jedem Lauf neu aus.

## Datenmodell

Drei Spalten auf `users` (siehe `frontend/server/db/schema/users.ts`):

| Spalte | Typ | Zweck |
|---|---|---|
| `newsletter_subscribed` | `ENUM('subscribed', 'unsubscribed')` nullable | Tri-state: `NULL` = nie explizit gesetzt |
| `unsubscribe_token` | `VARCHAR(64) UNIQUE` nullable | RFC-8058-Token für One-Click-Abmeldung; wird beim ersten Subscribe generiert |
| `newsletter_last_sent_at` | `DATETIME` nullable | Timestamp des letzten erfolgreichen Versands an diesen User |

## Settings-Seite

Eingeloggte Nutzer können den Newsletter unter `/settings` an- oder abschalten.
Die Seite ist über das Hauptmenü erreichbar und ruft intern
`GET /api/me/newsletter` und `POST /api/me/newsletter` auf.

## Abbestellen aus der Mail (RFC 8058)

Jede Mail enthält:

- `List-Unsubscribe: <https://app.example.com/api/newsletter/unsubscribe?token=...>`
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click`

Mail-Clients mit One-Click-Support (Gmail, iCloud Mail u.a.) zeigen einen
Abbestellen-Button neben dem Absender. Klassische Clients folgen dem `GET`-Link
und sehen eine HTML-Bestätigungsseite. Beide Wege landen auf demselben Endpoint
und sind idempotent.

## Cron-Eintrag (Sonntag 18:00)

```cron
# /etc/crontabs/root
0 18 * * 0 . /etc/jahrweiser-sync.env && curl -sS -X POST \
  -H "Authorization: Bearer $SYNC_SECRET" \
  https://app.example.com/api/admin/send-newsletter \
  >> /var/log/jahrweiser-newsletter.log 2>&1
```

`SYNC_SECRET` wird mit dem täglichen DAV-Sync geteilt — siehe
`docu/sync-crontab.md` für den Generierungs-Befehl (`openssl rand -hex 32`).

## Manueller Trigger

```sh
curl -X POST -H "Authorization: Bearer $SYNC_SECRET" \
  https://app.example.com/api/admin/send-newsletter
```

Antwort:

```json
{ "sent": 17, "skipped": 0, "errors": 0, "errorEmails": [] }
```

| Feld | Bedeutung |
|---|---|
| `sent` | Mails erfolgreich versandt |
| `skipped` | Reserviert (aktuell immer 0 — Token werden im Send-Endpoint on-the-fly erzeugt) |
| `errors` | Versand-Fehlschläge |
| `errorEmails` | Adressen, bei denen der Versand scheiterte |

## HTTP-Status

| Code | Bedeutung |
|---|---|
| 200 | Lauf beendet (JSON-Body prüfen) |
| 401 | Falsches/fehlendes Bearer-Token |
| 503 | `SYNC_SECRET` nicht konfiguriert |

## Inhalte

Pro Empfänger werden:

1. die nächsten 7 Tage ab Versandzeitpunkt aus allen sichtbaren Kalendern gelesen,
2. CLASS:PRIVATE-Termine herausgefiltert, wenn der User in seinem VCard nicht
   die CATEGORY mit dem Kalendernamen führt (gleiche Logik wie der Web-Kalender),
3. nach Tag gruppiert und chronologisch sortiert,
4. in eine HTML- *und* Plaintext-Variante gerendert
   (`server/emails/weekly-newsletter/{html,text}.pug`).

Tage ohne Termine werden weggelassen.
