# Umami-Server — Aufbau und Betrieb (Alpine LXC, nativ)

Die **geteilte** Umami-Instanz für alle Produkte. Jahrweiser ist nur eine
`websiteId` darin. Der Nuxt-Teil (Tracking-Anbindung) steht in
[`analytics-umami.md`](analytics-umami.md) — dieses Dokument endet an der
Stelle, an der die `websiteId` existiert.

Stand: 26.09.2026, Umami **v3.4.0**, Alpine **3.22**.

---

## 1. Die Architektur in vier Zeilen

| Weg | Adresse | Wer |
| --- | --- | --- |
| Dashboard | `https://analytics.webcraft-media.de` | du, öffentlich, TLS am zentralen Reverse-Proxy |
| Ingest | `http://<lxc-wg-ip>:3000/api/send` | nur die App-Hosts, server→server über WireGuard |

Der Ingest ist nie öffentlich. Die Produkte fahren `nuxt-umami` im
`proxy: 'cloak'`-Modus: der Browser postet an die Produkt-Domain, deren Nitro
leitet intern weiter. Zwei Folgen davon sind der Grund für den ganzen Zuschnitt:

- **Adblocker-Filterlisten sind egal.** Sie könnten höchstens dein Dashboard
  blocken, keinen einzigen Pageview. Deshalb darf die Subdomain
  `analytics.` heißen und muss nicht getarnt werden.
- **Die Statistik ist nicht von außen beschreibbar.** Wer eine `websiteId`
  kennt, kann sie trotzdem nicht aufblasen — der Endpunkt ist für ihn nicht da.

---

## 2. Warum nativ statt Docker

Bis Umami 2.x war ein nativer Alpine-Betrieb Arbeit: Prisma brauchte passende
Rust-Query-Engine-Binaries für musl. **Seit Umami 3 / Prisma 7 ist das weg** —
Prisma kompiliert Queries in TypeScript und redet über `@prisma/adapter-pg`.
Dazu kommt: jede verbliebene native Abhängigkeit (`@next/swc`, `rollup`,
`biome`, `sharp`, `@parcel/watcher`) liefert ein fertiges `*-musl`-Binary, und
das Lockfile enthält **kein** `node-gyp`. Also kein Compiler auf der Box.

Der Preis gegenüber Docker ist ehrlich zu nennen: **ein Update ist ein Rebuild
auf der Box**, kein `pull`. Das kostet 5–15 Minuten und währenddessen ~3–4 GB
RAM. Wenn du monatlich updaten willst, ist das in Ordnung; bei wöchentlich
würde ich das Argument neu aufmachen.

Betrieben wird der Next.js-**Standalone-Server** (`node server.js`), genau wie
im offiziellen Image. `next start` ist kein Weg: Next verweigert es, sobald
`next.config.ts` `output: 'standalone'` setzt — und das tut es dort immer.

---

## 3. LXC anlegen

Alpine **3.22** nehmen, nicht 3.23: 3.22 liefert `nodejs 22.x` und damit exakt
die Version, gegen die Umami baut (`node:22-alpine`). 3.23 hat Node 24 — läuft
vermutlich, ist aber nicht getestet.

Docker-Nesting (`features: nesting=1,keyctl=1`) braucht es nicht — das ist der
zweite Gewinn der nativen Variante, der Container bleibt unprivileged.

```
pct create 210 local:vztmpl/alpine-3.22-default_amd64.tar.xz \
  --hostname umami \
  --cores 2 --memory 4096 --swap 1024 \
  --rootfs local-lvm:16 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --onboot 1 --start 1
```

**Dimensionierung:** 4 GB RAM sind für den *Build* (Next.js). Im Betrieb liegt
Umami bei ~300–400 MB; du kannst nach dem Setup auf 2 GB runter und vor jedem
Update kurz wieder hoch. 16 GB Platte, weil `node_modules` + `.next` zusammen
gut 3 GB brauchen. 2 vCPU, sonst zieht sich der Build.

---

## 4. Setup ausführen

Script auf die Box bringen (von deiner Workstation aus):

```
scp infra/umami/setup.sh root@<lxc-ip>:/root/
```

Dann **auf der Box als root**:

```
apk update
sh /root/setup.sh
```

Das läuft 10–20 Minuten und ist **idempotent** — bei Abbruch einfach erneut
starten. Secrets werden genau einmal erzeugt und danach nie überschrieben.

Was es anlegt:

| Pfad | Inhalt |
| --- | --- |
| `/opt/umami` | Checkout + Build, gehört `umami:umami` |
| `/etc/umami/umami.env` | **alle Secrets**, `0640 root:umami` |
| `/etc/init.d/umami`, `/etc/conf.d/umami` | OpenRC-Service |
| `/var/log/umami/` | `umami.log`, `umami.err` + logrotate |
| `/var/backups/umami/` | nächtlicher `pg_dump`, 14 Tage |
| `/etc/periodic/monthly/umami-retention` | Löschung > 13 Monate |

`/opt/umami/.env` ist ein Symlink auf `/etc/umami/umami.env`. Eine Datei, zwei
Leser: OpenRC exportiert sie an den Dienst, `dotenv` liest sie beim Build und
in den Wartungs-Scripts. Umamis `.gitignore` deckt `.env` ab, ein
`git checkout -f` beim Update wirft den Symlink also nicht weg.

---

## 5. Erst-Login — sofort nach dem Setup

Umami legt beim ersten Build `admin` / `umami` an. Solange das so bleibt und
die Kiste gleich öffentlich hängt, ist das ein offenes Scheunentor.

Über WireGuard direkt auf `http://<lxc-ip>:3000`:

1. Einloggen mit `admin` / `umami`, **Passwort sofort ändern**.
2. **2FA aktivieren** (Profil → Security). Der Schlüssel dafür
   (`TWO_FACTOR_ENCRYPTION_KEY`) liegt schon in `/etc/umami/umami.env`.
3. Website **„Jahrweiser"** anlegen, Domain `gg-g.info`.
4. Die `websiteId` notieren — die wandert als `UMAMI_WEBSITE_ID` in die
   `app/.env` des Jahrweiser-Deploys.
5. **Session Replay und Heatmaps ausgeschaltet lassen** (pro Website
   einstellbar). Beide zeichnen DOM-Mutationen, Klickkoordinaten und
   Formular-Interaktionen auf. Das ist kein aggregiertes, consent-freies
   Tracking mehr, sondern Verhaltensaufzeichnung — mit Banner oder gar nicht.

---

## 6. Reverse-Proxy

`infra/umami/nginx-analytics.conf` auf die Public-Box, drei Platzhalter
ersetzen (WireGuard-IP der LXC, zwei Zertifikatspfade), Zertifikat holen,
`nginx -t && rc-service nginx reload`.

Drei Dinge daran sind Absicht und sollten beim Kopieren nicht verloren gehen:

- `location = /api/send { return 404; }` — der Ingest bleibt intern.
- `limit_req` auf `/api/auth/login` — 10/min pro IP.
- `X-Forwarded-For` wird gesetzt, und in der Env steht passend
  `CLIENT_IP_HEADER=x-forwarded-for`. Ohne das sieht Umami nur den Proxy und
  Geo-Auflösung wie Session-Hash kippen auf eine einzige „Besucher"-IP.

Umami v2+ **speichert keine IP-Adresse**; sie wird für Geo-Lookup und den
rotierenden Session-Hash benutzt und dann verworfen. `SALT_ROTATION=month`
sorgt dafür, dass derselbe Besucher jeden Monat eine neue Pseudonym-ID bekommt.
Das ist der Kern des Arguments, dass hier ohne Consent-Banner gearbeitet werden
kann — was nicht heißt, dass die Datenschutzerklärung das nicht beschreiben
muss (siehe `analytics-umami.md`, Teil 4).

---

## 7. Netzzugang absichern

Die LXC darf aus dem Internet nicht erreichbar sein. Der Dienst bindet auf
`0.0.0.0:3000`, weil Proxy und App-Hosts auf anderen Maschinen liegen — die
Begrenzung macht also das Netz, nicht der Bind:

- Kein Port-Forward 3000 auf dem Router.
- Erreichbar nur aus dem WireGuard-Netz.
- Optional als zweite Schicht auf der Box, wenn du sicher gehen willst:

```
apk add nftables
rc-update add nftables default
```

…mit einer Regel, die `tcp dport 3000` nur aus dem WG-Subnetz akzeptiert.

---

## 8. Betrieb

```
rc-service umami status          # läuft?
rc-service umami restart
tail -f /var/log/umami/umami.log /var/log/umami/umami.err
curl -fsS localhost:3000/api/heartbeat && echo OK
```

Der Service führt bei **jedem Start** ausstehende Prisma-Migrationen aus
(`scripts/check-db.js`), genau wie der offizielle Container. Abschaltbar über
`run_migrations="no"` in `/etc/conf.d/umami`.

**Backup** läuft nächtlich nach `/var/backups/umami/`, 14 Tage Vorhalt. Das ist
ein lokaler Dump — er schützt gegen kaputte Migrationen, nicht gegen den
Verlust der Box. Der Dump gehört in denselben Off-Site-Kreis wie die übrigen
Produktdaten.

**Retention** löscht monatlich Rohdaten älter als 13 Monate. Die Reihenfolge im
Script folgt den Fremdschlüsseln (Prisma erzeugt `ON DELETE RESTRICT`), und
Sessions fallen erst, wenn kein jüngeres Event mehr auf sie zeigt. Aggregierte
Auswertungen der Vergangenheit hält Umami **nicht** vor — was gelöscht ist, ist
aus den Reports verschwunden. 13 Monate sind deshalb die Untergrenze für einen
Jahresvergleich, nicht eine beliebige Zahl.

**Update:**

```
scp infra/umami/update.sh root@<lxc-ip>:/root/
sh /root/update.sh v3.5.0
```

Das Script dumpt erst, stoppt dann, checkt den Tag aus, baut neu (Migrationen
laufen dabei) und startet wieder. Der Rollback-Pfad steht in der Fehlermeldung,
falls der Heartbeat ausbleibt. **Vor dem Update die Release Notes lesen** —
Umami hat zwischen Majors schon Schema-Brüche gehabt (v3 hat MySQL komplett
gestrichen), und die Tabellennamen im Retention-Script sind gegen v3.4.0
verifiziert, nicht gegen alles Kommende.

---

## 9. Was bewusst ausgeschaltet ist

| Schalter | Warum |
| --- | --- |
| `DISABLE_TELEMETRY=1` | keine Nutzungsdaten an umami.is |
| `NEXT_TELEMETRY_DISABLED=1` | dito für Next.js |
| `DISABLE_UPDATES=1` | kein Versions-Ping nach außen; Updates prüfst du beim Release-Lesen |
| Session Replay / Heatmaps | Verhaltensaufzeichnung, nicht consent-frei |
| `/api/send` öffentlich | Ingest läuft server→server |

Ausgehende Verbindungen hat die Box damit nur noch beim Build (npm-Registry,
GitHub, GeoLite2-Download).

---

## 10. Wenn etwas klemmt

**Build wird abgeschossen (OOM).** `dmesg | tail` zeigt den OOM-Killer.
LXC-RAM auf 4–6 GB, `setup.sh` erneut laufen lassen.

**`pnpm install` bricht wegen Build-Scripts ab.** Das Setup hängt
`strictDepBuilds: false` an `pnpm-workspace.yaml` an — dieselbe Zeile, die
upstream im eigenen Dockerfile setzt. Nach einem `git checkout -f` von Hand ist
sie weg; `update.sh` setzt sie neu.

**Kein Heartbeat, Log zeigt Prisma-Fehler zur DB.** `pg_hba.conf` prüfen: das
Setup schiebt eine `scram-sha-256`-Zeile für `umami@127.0.0.1` **über** die
`trust`-Zeile von `initdb`, weil pg_hba first-match auswertet. Danach
`rc-service postgresql reload`.

**Dashboard lädt, aber ohne CSS.** Dann fehlen die Symlinks neben
`server.js` — `next build` schreibt `.next/standalone` bei jedem Build neu und
legt `public/` und `.next/static` *nicht* mit hinein. `update.sh` verlinkt sie
danach; wenn du von Hand gebaut hast, fehlt der Schritt.

**Geo-Daten leer.** `GEOLITE_DB_PATH` in der Env prüfen. Umami sucht die
`.mmdb` sonst relativ zu `process.cwd()`, und das ist im Standalone-Betrieb
nicht der Checkout.

---

## 11. Abnahme-Checkliste

- [ ] `rc-service umami status` → started, `curl localhost:3000/api/heartbeat` → OK
- [ ] Reboot der LXC → Postgres und Umami kommen von allein hoch
- [ ] Default-Passwort geändert, 2FA aktiv
- [ ] `https://analytics.webcraft-media.de` erreichbar, Login funktioniert
- [ ] `curl -X POST https://analytics.webcraft-media.de/api/send` → 404
- [ ] Website „Jahrweiser" angelegt, `websiteId` notiert
- [ ] Session Replay + Heatmaps aus
- [ ] `sh /etc/periodic/daily/umami-backup` → Dump liegt in `/var/backups/umami/`
- [ ] `sh /etc/periodic/monthly/umami-retention` → läuft fehlerfrei durch
- [ ] `/etc/umami/umami.env` ist `0640 root:umami`
