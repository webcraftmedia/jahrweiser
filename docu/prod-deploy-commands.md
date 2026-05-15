# Production Deploy — Befehls-Cheatsheet

Jeder Block kannst du einzeln auswählen + kopieren + ausführen.
Alle Befehle als **root** auf der App-/DB-Box. Voraussetzung: MariaDB läuft
(`rc-service mariadb status` → `started`).


## 1) DB + App-User anlegen

Passwort vorher generieren und ZWEIMAL einsetzen (im Block unten + später
in `.env`). Keine Quotes/Apostrophe im Passwort verwenden.

```
openssl rand -base64 32 | tr -d '/+='
```

Dann den folgenden Block — Passwort an der markierten Stelle ersetzen:

```
mariadb --socket=/run/mysqld/mysqld.sock -u root <<SQL
CREATE DATABASE IF NOT EXISTS \`jahrweiser\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'jahrweiser'@'localhost' IDENTIFIED BY 'ERSETZE_MICH_MIT_DEM_PASSWORT';
GRANT ALL PRIVILEGES ON \`jahrweiser\`.* TO 'jahrweiser'@'localhost';
FLUSH PRIVILEGES;
SQL
```


## 2) DB-User-Connect prüfen

Passwort wieder einsetzen. Connect über Socket (passt zu `@'localhost'`-User):

```
mariadb --socket=/run/mysqld/mysqld.sock -u jahrweiser -pERSETZE_MICH_MIT_DEM_PASSWORT -e "SHOW DATABASES;"
```

Erwartet: Liste mit `information_schema` und `jahrweiser`.


## 3) SYNC_SECRET für die App generieren

Den Output speichern — den Wert brauchst du in `.env` UND später im Cron.

```
openssl rand -hex 32
```


## 4) Prod-`.env` ergänzen

In `frontend/.env` diese Zeilen anhängen (Werte aus Schritt 1 und 3 einsetzen):

```
DB_SOCKET=/run/mysqld/mysqld.sock
DB_NAME=jahrweiser
DB_USER=jahrweiser
DB_PASSWORD=ERSETZE_MICH_MIT_DEM_PASSWORT
SYNC_SECRET=ERSETZE_MICH_MIT_DEM_SYNC_SECRET
```

`DB_SOCKET` lässt den mysql2-Treiber direkt den Unix-Socket nutzen statt
TCP. Voraussetzung: der DB-User wurde als `@'localhost'` angelegt (Schritt 1)
und MariaDB lauscht nicht auf TCP — was auf Alpine Default ist.

Falls du stattdessen über TCP gehen willst (z.B. weil DB auf anderer Box):

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=jahrweiser
DB_USER=jahrweiser
DB_PASSWORD=ERSETZE_MICH_MIT_DEM_PASSWORT
SYNC_SECRET=ERSETZE_MICH_MIT_DEM_SYNC_SECRET
```

Dann muss der DB-User aber `@'%'` oder `@'127.0.0.1'` sein, nicht `@'localhost'`.

Die bestehenden Werte (`NUXT_SESSION_PASSWORD`, `DAV_URL`, `DAV_USERNAME`,
`DAV_PASSWORD`, `CLIENT_URI`, `SMTP_*`) UNVERÄNDERT lassen.


## 5) Deploy triggern

Entweder Webhook auslösen oder manuell:

```
cd /var/www/localhost/htdocs
.github/webhooks/deploy.sh
```

Der ruft intern auf:
- `git pull`
- `npm ci`
- `npm run db:migrate`   ← legt die 5 Tabellen in jahrweiser an
- `npm run build`
- `pm2 start`

Bei Fehler bricht das Skript ab (`set -e`) — alte App bleibt unterm pm2 gestoppt.


## 6) Initial-Sync (einmalig nach erstem erfolgreichen Deploy)

Holt alle bestehenden DAV-User in MariaDB. SYNC_SECRET einsetzen:

```
curl -X POST -H "Authorization: Bearer ERSETZE_MICH_MIT_DEM_SYNC_SECRET" https://gg-g.info/api/admin/sync-now
```

Erwartet: JSON mit `{"added": N, "updated": 0, "deleted": 0, ...}` wobei N
die Anzahl deiner aktuellen DAV-User ist.


## 7) Verifikation der DB

```
mariadb --socket=/run/mysqld/mysqld.sock -u jahrweiser -pERSETZE_MICH_MIT_DEM_PASSWORT jahrweiser -e "SELECT COUNT(*) AS users FROM users;"
```

Sollte die gleiche Zahl wie `added` aus Schritt 6 zeigen.


## 8) Crontab für täglichen Sync einrichten

`.env`-File für die Cron-Umgebung anlegen:

```
cat > /etc/jahrweiser-sync.env <<EOF
SYNC_SECRET=ERSETZE_MICH_MIT_DEM_SYNC_SECRET
EOF
chmod 600 /etc/jahrweiser-sync.env
```

Crontab-Eintrag (z.B. 3 Uhr morgens):

```
crontab -l 2>/dev/null > /tmp/cron.bak
echo '0 3 * * * . /etc/jahrweiser-sync.env && curl -sS -X POST -H "Authorization: Bearer $SYNC_SECRET" https://gg-g.info/api/admin/sync-now >> /var/log/jahrweiser-sync.log 2>&1' >> /tmp/cron.bak
crontab /tmp/cron.bak
crontab -l
```

Letzte Zeile bestätigt dass der Eintrag drin ist.


## 8b) Crontab für wöchentlichen Newsletter (Sonntag 18:00)

`/etc/jahrweiser-sync.env` aus Schritt 8 wird wiederverwendet (`SYNC_SECRET`
ist derselbe). Eintrag anhängen:

```
crontab -l 2>/dev/null > /tmp/cron.bak
echo '0 18 * * 0 . /etc/jahrweiser-sync.env && curl -sS -X POST -H "Authorization: Bearer $SYNC_SECRET" https://gg-g.info/api/admin/send-newsletter >> /var/log/jahrweiser-newsletter.log 2>&1' >> /tmp/cron.bak
crontab /tmp/cron.bak
crontab -l
```

Phase 1 (Opt-in): in `.env` NICHTS extra setzen — nur Nutzer, die sich aktiv
in `/settings` anmelden, bekommen Mails. Für Phase 2 (Opt-out für alle)
später ergänzen:

```
NEWSLETTER_DEFAULT_OPT_IN=true
```

Manueller Probe-Versand zur Verifikation:

```
curl -X POST -H "Authorization: Bearer ERSETZE_MICH_MIT_DEM_SYNC_SECRET" https://gg-g.info/api/admin/send-newsletter
```

Antwort sollte `{"sent": N, "skipped": 0, "errors": 0, ...}` sein.


## 9) Login testen (eingeloggter Browser)

Ein bestehender User loggt sich ein → Mail kommt → Token funktioniert → eingeloggt.

Wenn das klappt, ist der Cutover funktional fertig.


## 10) (Optional, später) Cleanup der alten DAV-X-Properties

Erst NACHDEM mindestens ein Sync-Cron-Lauf geklappt hat und mehrere Logins
ohne Auffälligkeit liefen. Backup der DAV-DB davor!

```
cd /var/www/localhost/htdocs/frontend
ALLOW_PRODUCTION=1 I_HAVE_BACKED_UP_DAV=1 npm run cli:dav:purge-auth-xprops
```

Entfernt X_LOGIN_TOKEN / X_LOGIN_REQUEST_TIME / X_LOGIN_TIME /
X_LOGIN_DISABLED / X_ROLE aus allen VCards. Einbahnstraße — siehe
`docu/production-cutover.md`.
