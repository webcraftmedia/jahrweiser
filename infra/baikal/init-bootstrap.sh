#!/bin/sh
# Skips Baikal's install wizard so the container can start unattended.
# Mounted into /docker-entrypoint.d/99-bootstrap.sh.
#
# CRITICAL: must always exit 0 — the nginx entrypoint uses `set -e`, any
# non-zero exit here will loop the container. DAV user provisioning happens
# host-side via `npm run cli:baikal:bootstrap` (no PHP-in-container required).

set +e

BAIKAL_DIR=/var/www/baikal
INSTALL_MARKER="$BAIKAL_DIR/Specific/INSTALL_DISABLED"
CONFIG_FILE="$BAIKAL_DIR/config/baikal.yaml"

if [ -f "$INSTALL_MARKER" ]; then
  echo "[baikal-init] already configured"
  exit 0
fi

ADMIN_PASSWORD=${BAIKAL_ADMIN_PASSWORD:-admin}
ADMIN_HASH=$(printf 'admin:BaikalDAV:%s' "$ADMIN_PASSWORD" | md5sum | awk '{print $1}')

mkdir -p "$BAIKAL_DIR/config" "$BAIKAL_DIR/Specific/db" 2>/dev/null

cat > "$CONFIG_FILE" << EOF
parameters:
    timezone: 'Europe/Berlin'
    base_uri: ''
    invite_from: 'noreply@example.com'
    dav_auth_type: 'Basic'
    admin_passwordhash: '$ADMIN_HASH'
    auth_realm: 'BaikalDAV'
    failed_access_message: 'user %u authentication failure for Baikal'
    database:
        backend: 'sqlite'
        sqlite_file: 'Specific/db/db.sqlite'
EOF

touch "$INSTALL_MARKER" 2>/dev/null
chown -R www-data:www-data "$BAIKAL_DIR/Specific" "$BAIKAL_DIR/config" 2>/dev/null

echo "[baikal-init] wizard skipped (admin password: '$ADMIN_PASSWORD')"
echo "[baikal-init] next: from host, run 'npm run cli:baikal:bootstrap' to create the DAV user"
exit 0
