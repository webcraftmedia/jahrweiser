#!/bin/sh
# Bootstrap database + app user via the local MariaDB unix socket.
# Authenticates as the *system* root user (unix_socket plugin) — no DB
# password required. Use when the standard setup.sh fails because:
#   - root uses unix_socket auth (no DB password set)
#   - the mysql/mariadb CLI default socket path doesn't match the server's
#
# Required env vars:
#   DB_PASSWORD   Password to set on the new app user
#
# Optional env vars (defaults shown):
#   DB_NAME=jahrweiser
#   DB_USER=jahrweiser
#   DB_HOST_ACL=127.0.0.1   ACL host for the new user. The mysql2 driver
#                           connects via TCP when DB_HOST=localhost in
#                           frontend/.env, so '127.0.0.1' (not 'localhost')
#                           is what Node will be authenticating from.
#   SOCKET=/run/mysqld/mysqld.sock
#   MYSQL_BIN=mariadb
#
# Run as system root (sudo or already root). Idempotent.

set -eu

: "${DB_PASSWORD:?DB_PASSWORD must be set}"

DB_NAME=${DB_NAME:-jahrweiser}
DB_USER=${DB_USER:-jahrweiser}
DB_HOST_ACL=${DB_HOST_ACL:-127.0.0.1}
SOCKET=${SOCKET:-/run/mysqld/mysqld.sock}
MYSQL_BIN=${MYSQL_BIN:-mariadb}

if [ ! -S "$SOCKET" ]; then
  echo "Socket $SOCKET does not exist. Is MariaDB running?" >&2
  echo "Try: rc-service mariadb status" >&2
  echo "Or override SOCKET=/path/to/your/socket" >&2
  exit 1
fi

if ! command -v "$MYSQL_BIN" >/dev/null 2>&1; then
  echo "Cannot find '$MYSQL_BIN' on PATH." >&2
  exit 1
fi

echo "[db-setup-socket] socket: $SOCKET (no password, system root via unix_socket auth)"
echo "[db-setup-socket] will ensure database '$DB_NAME' and user '$DB_USER'@'$DB_HOST_ACL' exist"

"$MYSQL_BIN" --socket="$SOCKET" -u root <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS '$DB_USER'@'$DB_HOST_ACL'
  IDENTIFIED BY '$DB_PASSWORD';

GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'$DB_HOST_ACL';

FLUSH PRIVILEGES;
SQL

echo "[db-setup-socket] done."
echo "[db-setup-socket] verify: $MYSQL_BIN -h 127.0.0.1 -u $DB_USER -p\"\$DB_PASSWORD\" -e 'SHOW DATABASES'"
echo "[db-setup-socket] next: cd frontend && npm run db:migrate"
