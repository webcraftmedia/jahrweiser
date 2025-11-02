User opens Frontend
-> Login with email
-> Backend
-> Is EMail Whitelisted?
-> Generate MagicLink (Duration 1h)
-> Save MagicLink in Database
-> Send EMail
-> Return and show user "Maybe we sent you an EMail . takes time,check spam folder"

User opens link from email
-> Frontend sends Link to Backend
-> Check for Magic Link
-> If failure Page Ups this didn't work -> back to login
-> If Success Return JWT (1w duration)
-> Frontend has JWT so -> Query User
-> Backend returns just the email for now (from jwt, no query needed atm)
-> If Failure -> Login
-> If Success Redirect to calendar

User requests Calendar
-> Frontend has JWT
-> Asks backend for Calendar Items
-> Backend asks Baikal cal items using System account
-> Returns calendar items in correct format
-> Frontend renders

# Jahrweiser

This repo is the calendar page for gg-g.info

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
