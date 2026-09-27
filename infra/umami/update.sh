#!/bin/sh
# Upgrade an existing native Umami install to another release.
#
# Run as root on the Umami LXC, after setup.sh has been run once.
#
#   ./update.sh v3.5.0
#
# What it does, in order: dump the database, stop the service, check out the
# tag, rebuild, restart. The rebuild applies pending Prisma migrations
# (`pnpm build` runs check:db), so the dump is the only way back — take it
# seriously, Umami's own release notes have warned about v2→v3 migrations on
# non-empty databases.

set -eu

UMAMI_VERSION=${1:-}
[ -n "$UMAMI_VERSION" ] || { echo "usage: $0 <tag>   e.g. $0 v3.5.0" >&2; exit 1; }

UMAMI_DIR=${UMAMI_DIR:-/opt/umami}
STATE_DIR=${STATE_DIR:-/var/lib/umami}
ENV_FILE=${ENV_FILE:-/etc/umami/umami.env}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/umami}
UMAMI_USER=umami
UMAMI_GROUP=umami
DB_NAME=umami
BIND_PORT=${BIND_PORT:-3000}

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die() { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

as_umami() {
	su -s /bin/sh "$UMAMI_USER" -c "set -eu
		export HOME='$STATE_DIR'
		export PNPM_HOME='$STATE_DIR/.pnpm'
		export PATH=\"\$PNPM_HOME:$UMAMI_DIR/node_modules/.bin:\$PATH\"
		export NEXT_TELEMETRY_DISABLED=1
		cd '$UMAMI_DIR'
		$*"
}

[ "$(id -u)" = 0 ] || die "run as root"
[ -d "$UMAMI_DIR/.git" ] || die "no Umami checkout at $UMAMI_DIR — run setup.sh first"

current=$(git -C "$UMAMI_DIR" describe --tags --always)
log "Upgrading ${current} → ${UMAMI_VERSION}"

log "Backing up the database first"
install -d -m 0750 "$BACKUP_DIR"
dump="$BACKUP_DIR/${DB_NAME}-pre-${UMAMI_VERSION}-$(date +%F-%H%M).dump"
su postgres -c "pg_dump -Fc ${DB_NAME}" > "$dump"
info "$dump ($(du -h "$dump" | cut -f1))"

log "Stopping the service"
rc-service umami stop || true

log "Checking out ${UMAMI_VERSION}"
git config --global --add safe.directory "$UMAMI_DIR" 2>/dev/null || true
git -C "$UMAMI_DIR" fetch --depth 1 origin \
	"refs/tags/${UMAMI_VERSION}:refs/tags/${UMAMI_VERSION}" 2>/dev/null \
	|| die "tag ${UMAMI_VERSION} not found upstream"
git -C "$UMAMI_DIR" checkout -f "$UMAMI_VERSION"
chown -R "$UMAMI_USER":"$UMAMI_GROUP" "$UMAMI_DIR"

# `checkout -f` reverted both of these — they are not part of the upstream tree.
ln -sfn "$ENV_FILE" "$UMAMI_DIR/.env"
grep -q '^strictDepBuilds:' "$UMAMI_DIR/pnpm-workspace.yaml" \
	|| printf 'strictDepBuilds: false\n' >> "$UMAMI_DIR/pnpm-workspace.yaml"

log "Building (applies pending database migrations)"
as_umami "pnpm install --frozen-lockfile"
as_umami "pnpm build"

log "Re-wiring the standalone runtime"
sa="$UMAMI_DIR/.next/standalone"
[ -f "$sa/server.js" ] || die "no standalone server at $sa — build failed?"
mkdir -p "$sa/.next"
ln -sfn "$UMAMI_DIR/public" "$sa/public"
ln -sfn "$UMAMI_DIR/generated" "$sa/generated"
ln -sfn "$UMAMI_DIR/prisma" "$sa/prisma"
ln -sfn "$UMAMI_DIR/.next/static" "$sa/.next/static"
chown -h "$UMAMI_USER":"$UMAMI_GROUP" \
	"$sa/public" "$sa/generated" "$sa/prisma" "$sa/.next/static"

log "Starting"
rc-service umami start
i=0
until curl -fsS "http://127.0.0.1:${BIND_PORT}/api/heartbeat" >/dev/null 2>&1; do
	i=$((i + 1))
	[ "$i" -lt 60 ] || die "no heartbeat after 60s — tail -n 50 /var/log/umami/umami.err

Rollback:
  rc-service umami stop
  git -C $UMAMI_DIR checkout -f $current
  su postgres -c 'dropdb $DB_NAME && createdb -O $DB_NAME $DB_NAME'
  su postgres -c 'pg_restore -d $DB_NAME' < $dump
  ./update.sh $current"
	sleep 1
done

log "Umami $(git -C "$UMAMI_DIR" describe --tags --always) is up"
info "Rollback dump kept at $dump"
