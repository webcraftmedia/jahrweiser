#!/bin/sh
# Bootstrap the auth-sidecar database and application user on a MariaDB or
# MySQL server. Idempotent. Run once per environment; schema migrations are
# applied separately by `npm run db:migrate`.
#
# Required env vars:
#   DB_PASSWORD          Password for the application user being created
#
# Optional env vars (defaults shown):
#   DB_NAME=jahrweiser
#   DB_USER=jahrweiser
#   DB_HOST=localhost
#   DB_PORT=3306
#   DB_ADMIN_USER=root   Existing admin account used to create the DB+user
#   DB_ADMIN_PASSWORD    If set, used non-interactively. Otherwise mysql prompts.
#   MYSQL_BIN=mysql      Override to `mariadb` on MariaDB-only systems
#
# Example:
#   DB_PASSWORD='strong-prod-secret' \
#   DB_HOST=db.internal \
#   DB_ADMIN_USER=root \
#   ./infra/db/setup.sh

set -eu

: "${DB_PASSWORD:?DB_PASSWORD must be set (the app user's password)}"

DB_NAME=${DB_NAME:-jahrweiser}
DB_USER=${DB_USER:-jahrweiser}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-3306}
DB_ADMIN_USER=${DB_ADMIN_USER:-root}
MYSQL_BIN=${MYSQL_BIN:-mysql}

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SQL_FILE="$SCRIPT_DIR/setup.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "Missing $SQL_FILE" >&2
  exit 1
fi

if ! command -v "$MYSQL_BIN" >/dev/null 2>&1; then
  echo "Cannot find '$MYSQL_BIN' on PATH. Install the MariaDB/MySQL client or set MYSQL_BIN." >&2
  exit 1
fi

if ! command -v envsubst >/dev/null 2>&1; then
  echo "Cannot find 'envsubst' on PATH (provided by the 'gettext' package)." >&2
  echo "Install gettext, or substitute placeholders manually:" >&2
  echo "  sed -e 's/\${DB_NAME}/$DB_NAME/g' -e 's/\${DB_USER}/$DB_USER/g' \\" >&2
  echo "      -e 's/\${DB_PASSWORD}/<your-password>/g' $SQL_FILE | \\" >&2
  echo "  $MYSQL_BIN -h $DB_HOST -P $DB_PORT -u $DB_ADMIN_USER -p" >&2
  exit 1
fi

echo "[db-setup] target: $DB_ADMIN_USER@$DB_HOST:$DB_PORT"
echo "[db-setup] will ensure database \`$DB_NAME\` and user '$DB_USER'@'%' exist"

export DB_NAME DB_USER DB_PASSWORD

if [ -n "${DB_ADMIN_PASSWORD:-}" ]; then
  MYSQL_PWD="$DB_ADMIN_PASSWORD" envsubst < "$SQL_FILE" |
    "$MYSQL_BIN" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_ADMIN_USER"
else
  envsubst < "$SQL_FILE" |
    "$MYSQL_BIN" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_ADMIN_USER" -p
fi

echo "[db-setup] done."
echo "[db-setup] next: cd frontend && npm run db:migrate"
