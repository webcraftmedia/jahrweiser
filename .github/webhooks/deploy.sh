#!/bin/sh
# Abort on any failure — we don't want to start a new app version with a
# half-applied DB migration or an aborted build.
set -e

# Find current directory & configure paths
SCRIPT_PATH=$(realpath $0)
SCRIPT_DIR=$(dirname $SCRIPT_PATH)
PROJECT_ROOT=$SCRIPT_DIR/../..

TAG=$1

cd $PROJECT_ROOT

if [ -n "$TAG" ]; then
  git fetch --tags
  git checkout "$TAG"
else
  git checkout master
  git pull
fi

## App
APP_ROOT=$PROJECT_ROOT/app
APP_SERVICE=$PROJECT_ROOT/.github/webhooks/ecosystem.config.js

cd $APP_ROOT

### Stop service
pm2 stop $APP_SERVICE
pm2 delete $APP_SERVICE

# And the name the process had before the directory was renamed to `app/`.
# Stopping by the *config* only ever matches the name the config carries today,
# so a host still running the old process would keep it — holding port 3000
# while the new one tries to bind it, which pm2 reports as a restart loop rather
# than as a failed deploy.
#
# `|| true` is not decoration: unlike `pm2 stop <config>`, which exits 0 when
# there is nothing to stop, `pm2 delete <name>` exits 1 for a name it does not
# know — so without it every deploy after the first would abort on `set -e`.
pm2 delete jahrweiser-frontend || true

### Config
export TZ=UTC

### Install
npm ci --omit=dev

### Migrate DB (must run before build/start so the new app sees up-to-date schema)
npm run db:migrate

### Build
npm run build

### Start service
pm2 start $APP_SERVICE
