#!/bin/sh
# Auto-provisions Baikal for local dev/test: writes config, skips wizard,
# initializes the SQLite schema, and creates a DAV admin principal +
# addressbook. Mounted into the baikal container as
# /docker-entrypoint.d/99-bootstrap.sh. Idempotent.
#
# Knobs (env, all optional):
#   BAIKAL_ADMIN_PASSWORD   master password for the /admin web UI (default: admin)
#   BAIKAL_DAV_USERNAME     DAV principal username (default: admin)
#   BAIKAL_DAV_PASSWORD     DAV principal password (default: admin)
#   BAIKAL_DAV_EMAIL        DAV principal email   (default: admin@example.com)
#   BAIKAL_DAV_DISPLAYNAME  DAV principal display name (default: Admin)

set -eu

BAIKAL_DIR=/var/www/baikal
INSTALL_MARKER="$BAIKAL_DIR/Specific/INSTALL_DISABLED"
CONFIG_FILE="$BAIKAL_DIR/config/baikal.yaml"
DB_FILE="$BAIKAL_DIR/Specific/db/db.sqlite"

if [ -f "$INSTALL_MARKER" ] && [ -f "$DB_FILE" ]; then
  echo "[baikal-init] already provisioned"
  exit 0
fi

ADMIN_PASSWORD=${BAIKAL_ADMIN_PASSWORD:-admin}
DAV_USERNAME=${BAIKAL_DAV_USERNAME:-admin}
DAV_PASSWORD=${BAIKAL_DAV_PASSWORD:-admin}
DAV_EMAIL=${BAIKAL_DAV_EMAIL:-admin@example.com}
DAV_DISPLAYNAME=${BAIKAL_DAV_DISPLAYNAME:-Admin}
REALM=BaikalDAV

ADMIN_HASH=$(printf 'admin:%s:%s' "$REALM" "$ADMIN_PASSWORD" | md5sum | awk '{print $1}')
DAV_HASH=$(printf '%s:%s:%s' "$DAV_USERNAME" "$REALM" "$DAV_PASSWORD" | md5sum | awk '{print $1}')

mkdir -p "$BAIKAL_DIR/config" "$BAIKAL_DIR/Specific/db"

# 1) Baikal config — admin web UI password + SQLite path
cat > "$CONFIG_FILE" << EOF
parameters:
    timezone: 'Europe/Berlin'
    base_uri: ''
    invite_from: 'noreply@example.com'
    dav_auth_type: 'Digest'
    admin_passwordhash: '$ADMIN_HASH'
    auth_realm: '$REALM'
    failed_access_message: 'user %u authentication failure for Baikal'
    database:
        backend: 'sqlite'
        sqlite_file: 'Specific/db/db.sqlite'
EOF

# 2) Initialize DB schema (via Baikal's bundled SQL definitions) and
#    insert principal + DAV auth row + default addressbook.
php <<PHP
<?php
\$db = new PDO('sqlite:$DB_FILE');
\$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
\$db->exec('PRAGMA foreign_keys = ON');

// Apply every bundled .sql definition. Baikal ships them under
// Core/Distrib/SQLDefinitions/sqlite. Statements use CREATE TABLE IF NOT
// EXISTS so re-application is safe.
\$schemaGlob = '$BAIKAL_DIR/Core/Distrib/SQLDefinitions/sqlite/*.sql';
\$files = glob(\$schemaGlob);
if (empty(\$files)) {
    fwrite(STDERR, "[baikal-init] no schema files at \$schemaGlob — Baikal layout changed?\n");
    exit(1);
}
foreach (\$files as \$f) {
    \$sql = file_get_contents(\$f);
    foreach (preg_split('/;\\s*\$/m', \$sql) as \$stmt) {
        \$stmt = trim(\$stmt);
        if (\$stmt === '') continue;
        try { \$db->exec(\$stmt); } catch (PDOException \$e) { /* idempotent: ignore */ }
    }
}

// Insert principal + auth + default addressbook.
\$db->prepare("INSERT OR IGNORE INTO principals (uri, email, displayname) VALUES (?, ?, ?)")
   ->execute(['principals/$DAV_USERNAME', '$DAV_EMAIL', '$DAV_DISPLAYNAME']);
\$db->prepare("INSERT OR IGNORE INTO users (username, digesta1) VALUES (?, ?)")
   ->execute(['$DAV_USERNAME', '$DAV_HASH']);
\$db->prepare("INSERT OR IGNORE INTO addressbooks (principaluri, displayname, uri, description, synctoken) VALUES (?, ?, ?, ?, 1)")
   ->execute(['principals/$DAV_USERNAME', 'Default Address Book', 'default', 'Default Address Book']);
\$db->prepare("INSERT OR IGNORE INTO calendars (synctoken) VALUES (1)")
   ->execute([]);
\$cid = \$db->lastInsertId();
if (\$cid) {
    \$db->prepare("INSERT OR IGNORE INTO calendarinstances (calendarid, principaluri, displayname, uri, description, calendarorder, calendarcolor, transparent) VALUES (?, ?, ?, ?, ?, 0, '#FFFFFF', 0)")
       ->execute([\$cid, 'principals/$DAV_USERNAME', 'Default Calendar', 'default', 'Default Calendar']);
}

echo "[baikal-init] DAV user '$DAV_USERNAME' + default addressbook provisioned\n";
PHP

touch "$INSTALL_MARKER"

chown -R www-data:www-data "$BAIKAL_DIR/Specific" "$BAIKAL_DIR/config" 2>/dev/null || true

echo "[baikal-init] complete (web admin: $ADMIN_PASSWORD; dav: $DAV_USERNAME/$DAV_PASSWORD)"
