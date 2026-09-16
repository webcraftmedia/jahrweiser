# Jahrweiser

This repo is the calendar page for gg-g.info.

## Aufbau

| Verzeichnis | Inhalt |
| ----------- | ------ |
| `app/`      | Die Anwendung: Nuxt-Client (`src/`), Nitro-Server und DB (`server/`), CLI-Werkzeuge (`cli/`), Tests. Heißt nicht `frontend/`, weil unter `server/` mehr Dateien liegen als unter `src/`. |
| `admin/`    | CalDavZAP/CardDavMATE, als Adressbuch-Oberfläche eingebunden |
| `infra/`    | Baikal- und Datenbank-Einrichtung für Entwicklung und Produktion |
| `docu/`     | Fachdokumentation, ein Dokument je Bereich |

### Commit- und PR-Titel

Conventional Commits, Scope verpflichtend — `.github/workflows/test.lint.pr.yml`
prüft PR-Titel und führt die erlaubte Liste. Die Scopes schneiden nach dem, was
ein Release riskant macht, nicht nach Fachbereichen:

| Scope | Gilt für |
| ----- | -------- |
| `app` | alles unter `app/` |
| `db` | Schema und Migrationen — der Scope, der sagt, ob ein Deploy migrieren muss |
| `infra` | `infra/`, `docker-compose*`, `.github/webhooks/` |
| `admin` | `admin/` |
| `docu` | `docu/`, READMEs |
| `docker` | Dockerfile und Image-Bau |
| `deps` | Abhängigkeiten (Dependabot ist vom PR-Check ausgenommen, manuelle Bumps nicht) |
| `workflow` | `.github/workflows/` |
| `release` | release-please |
| `other` | der ehrliche Rest |

## Ziele
- Kalenderübesicht zu anstehenden Terminen
- Nutzerverwaltung
- Anschluss weiterer Services
  - Karte (siehe `docu/karte.md`)
  - Telegram Kanäle
  - Lebensmittel
  - Blättchen
- CalDAV fürs Handy & Thunderbird

## Installation on alpine

```sh
apk add git npm nginx
rc-update add nginx boot
service nginx start
```


nginx config
```
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    client_body_buffer_size     10M;
    client_max_body_size        10M;

    location / {
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   X-Forwarded-For $remote_addr;
        proxy_set_header   X-Real-IP  $remote_addr;
        proxy_set_header   Host $host;
        
        proxy_pass         http://127.0.0.1:3000;
        proxy_redirect     off;

        #access_log $LOG_PATH/nginx-access.hooks.log hooks_log;
        #error_log $LOG_PATH/nginx-error.backend.hook.log warn;
    }

    location /hooks/ {
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   X-Forwarded-For $remote_addr;
        proxy_set_header   X-Real-IP  $remote_addr;
        proxy_set_header   Host $host;
        
        proxy_pass         http://127.0.0.1:9000/hooks/;
        proxy_redirect     off;

        #access_log $LOG_PATH/nginx-access.hooks.log hooks_log;
        #error_log $LOG_PATH/nginx-error.backend.hook.log warn;
    }

    location /admin/ {
        #access_log $LOG_PATH/nginx-access.hooks.log hooks_log;
        #error_log $LOG_PATH/nginx-error.backend.hook.log warn;
    }
}
```

## Deploy

You can use the webhook template `webhook.conf.template` and the `deploy.sh` script in `.github/webhooks/` for an automatic deployment from a (github) webhook.

For this to work follow these steps (using alpine):

```sh
apk add webhook
cp .github/webhooks/hooks.json.template .github/webhooks/hooks.json
vi .github/webhooks/hooks.json
# adjust content of .github/webhooks/hooks.json
# replace all variables accordingly

# copy webhook service file
cp .github/webhooks/webhook.template /etc/init.d/webhook
vi /etc/init.d/webhook
# adjust content of /etc/init.d/webhook
chmod +x /etc/init.d/webhook

service webhook start
rc-update add webhook boot

vi /etc/nginx/http.d/default.conf
# adjust the nginx config
# location /hooks/ {
#     proxy_http_version 1.1;
#     proxy_set_header   Upgrade $http_upgrade;
#     proxy_set_header   Connection 'upgrade';
#     proxy_set_header   X-Forwarded-For $remote_addr;
#     proxy_set_header   X-Real-IP  $remote_addr;
#     proxy_set_header   Host $host;
# 
#     proxy_pass         http://127.0.0.1:9000/hooks/;
#     proxy_redirect     off;
# 
#     #access_log $LOG_PATH/nginx-access.hooks.log hooks_log;
#     #error_log $LOG_PATH/nginx-error.backend.hook.log warn;
# }

# The github payload is quite big sometimes, hence those two lines can prevent an reoccurring error message on nginx
# client_body_buffer_size     10M;
# client_max_body_size        10M;

# for the backend install pm2
npm install pm2 -g

# expose the backend service via nginx
vi /etc/nginx/http.d/default.conf
# location /api/ {
#     proxy_http_version 1.1;
#     proxy_set_header   Upgrade $http_upgrade;
#     proxy_set_header   Connection 'upgrade';
#     proxy_set_header   X-Forwarded-For $remote_addr;
#     proxy_set_header   X-Real-IP  $remote_addr;
#     proxy_set_header   Host $host;
#
#     proxy_pass         http://127.0.0.1:3000/;
#     proxy_redirect     off;
#
#     #access_log $LOG_PATH/nginx-access.api.log hooks_log;
#     #error_log $LOG_PATH/nginx-error.api.log warn;
# }
```

For the github webhook configure the following:

| Field                                                | Value                         |
|------------------------------------------------------|-------------------------------|
| Payload URL                                          | https://XXX/hooks/github |
| Content type                                         | application/json              |
| Secret                                               | A SECRET                      |
| SSL verification                                     | Enable SSL verification       |
| Which events would you like to trigger this webhook? | Send me everything.           |
| Active                                               | [x]                           |
