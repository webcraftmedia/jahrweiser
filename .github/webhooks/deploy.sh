#!/bin/sh

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

## Frontend
FRONTEND_ROOT=$PROJECT_ROOT/frontend
FRONTEND_SERVICE=$PROJECT_ROOT/.github/webhooks/ecosystem.config.js

cd $FRONTEND_ROOT

### Stop service
pm2 stop $FRONTEND_SERVICE
pm2 delete $FRONTEND_SERVICE

### Config
export TZ=UTC

### Build
npm ci --omit=dev
npm run build

### Start service
pm2 start $FRONTEND_SERVICE
