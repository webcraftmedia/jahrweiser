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
