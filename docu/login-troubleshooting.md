# „Ich komme nicht rein" — Login-Störungen einordnen

Ein Mitglied meldet, dass der Anmeldelink nicht funktioniert. Diese Seite sagt,
woran man in fünf Minuten erkennt, ob das Problem auf unserer Seite liegt.

## Die drei Bilder, die gemeldet werden

| Was das Mitglied sieht                           | Was passiert ist                                  |
| ------------------------------------------------ | ------------------------------------------------- |
| Drei Punkte, die nicht weggehen                   | Eine Anfrage, die nie beantwortet wurde           |
| Wieder das Login-Formular, ohne Erklärung         | Anmeldung lief durch, der Browser behielt sie nicht |
| „Dieser Link wurde bereits verwendet"             | Token verbraucht — oft vom Virenscanner des Postfachs |

Seit den Deadlines in `src/utils/withTimeout.ts` kann das erste Bild nicht mehr
dauerhaft stehen bleiben: nach 15 Sekunden wird daraus „Der Server hat nicht
geantwortet" samt „Nochmal versuchen". Kommt die Meldung trotzdem noch, ist die
Seite älter als dieses Release — Cache leeren lassen.

## Schritt 1: ins Log schauen

Jede Einlösung hinterlässt genau eine Zeile (`server/api/redeemLoginLink.post.ts`):

```
[auth] redeem ok uid=<dav-uid>
[auth] redeem used uid=<dav-uid>
[auth] redeem expired uid=<dav-uid>
[auth] redeem unknown
[auth] redeem disabled uid=<dav-uid>
```

Absichtlich ohne Token (ein lebendes Credential) und ohne Adresse — die UID
genügt zur Zuordnung und steht ohnehin in jeder Zeile, die wir zu dem Mitglied
speichern.

```sh
pm2 logs jahrweiser --lines 2000 --nostream | grep '\[auth\] redeem'
```

- **Gar keine Zeile zum fraglichen Zeitpunkt** → die Anfrage kam nie an.
  Verbindung des Mitglieds, oder der Server/die Datenbank hing (siehe
  Schritt 3).
- **`ok`** → wir haben alles richtig gemacht. Das Problem sitzt im Browser
  (Schritt 2).
- **`used` / `expired` / `unknown`** → der Link war tatsächlich nicht mehr
  gültig; neuen anfordern lassen.
- **`disabled`** → Konto gesperrt oder gelöscht. Das ist eine bewusste
  Entscheidung, kein Fehler.

Kein Scanner-Rauschen mehr im Log: `server/middleware/01.probe-filter.ts`
beantwortet `wp-admin`, `.env` & Co. direkt mit 404, ohne Renderer und ohne
Datenbank.

## Schritt 2: Wenn das Log `ok` sagt

Dann existiert die Sitzung serverseitig, und der Browser hat das Cookie nicht
behalten. Das Mitglied sieht dafür seit diesem Release eine eigene Meldung
(„Die Anmeldung hat geklappt, aber dein Browser hat sie nicht gespeichert") —
früher landete es wortlos wieder im Login-Formular, mit einem Link weniger.

Übliche Ursachen, in dieser Reihenfolge abfragen:

1. **Link im eingebauten Browser der Mail-App geöffnet** (Outlook, Gmail,
   WhatsApp). Der loggt sich in seinem eigenen Cookie-Topf ein; im normalen
   Browser ist das Mitglied weiterhin ausgeloggt. → Link kopieren und in
   Chrome/Safari/Firefox öffnen.
2. **Cookies blockiert** (Privatmodus, strenge Tracking-Einstellung).
3. **Gerätedatum grob falsch** — ein Cookie mit Ablauf „in der Vergangenheit"
   wird sofort verworfen.

Zur Gegenprobe in der Datenbank (`docu/database.md` erklärt das Schema):

```sql
SELECT t.requested_at, t.expires_at, t.consumed_at
  FROM login_tokens t JOIN users u ON u.uid = t.user_uid
 WHERE u.email = '<adresse>' ORDER BY t.requested_at DESC LIMIT 10;

SELECT s.id, s.created_at, s.expires_at, s.revoked_at, s.last_seen_at
  FROM sessions s JOIN users u ON u.uid = s.user_uid
 WHERE u.email = '<adresse>' ORDER BY s.created_at DESC LIMIT 5;

SELECT login_disabled, deleted_at FROM users WHERE email = '<adresse>';
```

`consumed_at` gesetzt **und** eine passende `sessions`-Zeile vorhanden, aber
`last_seen_at` bleibt auf dem Wert von der Anmeldung: klassisches
Cookie-Problem — die Sitzung wurde nie wieder benutzt.

`consumed_at` wenige Sekunden nach `requested_at`, ohne dass das Mitglied
geklickt hat: der Virenscanner des Postfachs war schneller. Dagegen steht die
Klick-Bestätigung auf `/login/{token}` — sie zu umgehen wäre der Rückfall in
genau dieses Problem.

## Schritt 3: Wenn gar nichts im Log steht

Dann hat die Anfrage den Handler nicht erreicht oder die Datenbank hat nicht
geantwortet. Jede Auth-Query läuft gegen eine Deadline
(`server/helpers/dbTimeout.ts`, 8 s) und endet sonst mit **503**:

```sh
pm2 logs jahrweiser --lines 2000 --nostream | grep -i '503\|Database unavailable'
systemctl status mariadb        # bzw. rc-service mariadb status
```

Hintergrund: mysql2 kennt kein Acquire-Timeout. Ist der Pool (10 Verbindungen)
belegt oder stecken halboffene Sockets darin, wartet eine Query sonst
unbegrenzt — und der Request wird nie beantwortet. Deshalb zusätzlich
`connectTimeout`, Keepalive und `idleTimeout` in `server/db/index.ts`.
