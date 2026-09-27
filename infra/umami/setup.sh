#!/bin/sh
# Umami analytics — native install on Alpine Linux, no Docker.
#
# Target: a fresh Alpine 3.22 LXC on Proxmox. Run as root.
#
# Why native is painless since Umami 3.x (it was not before):
#   - Prisma 7 dropped the Rust query engine (TypeScript query compiler +
#     @prisma/adapter-pg), so the musl/glibc engine-binary problem is gone.
#   - Every remaining native dependency (@next/swc, rollup, biome, sharp,
#     @parcel/watcher) ships a prebuilt *-linux-*-musl binary.
#   - The lockfile contains no node-gyp/prebuild-install, so no C toolchain
#     is needed on the box.
#
# The install mirrors the upstream Dockerfile: build once, then run the
# Next.js standalone server (`node server.js`). `next start` is NOT usable —
# Next refuses it when next.config.ts sets output: 'standalone'.
#
# Idempotent: safe to re-run. Secrets are generated on first run and never
# overwritten afterwards.
#
# Usage:
#   ./setup.sh
#   UMAMI_VERSION=v3.5.0 ./setup.sh
#
# Upgrades to a newer Umami release: use update.sh, not this script.

set -eu

# --- Configuration ----------------------------------------------------------

UMAMI_VERSION=${UMAMI_VERSION:-v3.4.0}
PNPM_VERSION=${PNPM_VERSION:-12.3.4}   # keep in sync with package.json engines.pnpm

UMAMI_DIR=${UMAMI_DIR:-/opt/umami}
STATE_DIR=${STATE_DIR:-/var/lib/umami}     # HOME of the service user, pnpm store
ENV_FILE=${ENV_FILE:-/etc/umami/umami.env}
LOG_DIR=${LOG_DIR:-/var/log/umami}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/umami}

UMAMI_USER=umami
UMAMI_GROUP=umami
DB_NAME=umami
DB_USER=umami

# Bind address of the Next.js server. 0.0.0.0 because the reverse proxy and
# the app host live on other machines (reached over WireGuard). The LXC itself
# must not be exposed to the public internet — see docu/umami-server.md.
BIND_HOST=${BIND_HOST:-0.0.0.0}
BIND_PORT=${BIND_PORT:-3000}

# Data retention for raw event rows, in months. 13 months keeps a full
# year-over-year comparison and matches what the privacy policy will state.
RETENTION_MONTHS=${RETENTION_MONTHS:-13}
BACKUP_KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}

# --- Helpers ----------------------------------------------------------------

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

# Run a command as the service user with a sane build environment.
as_umami() {
	su -s /bin/sh "$UMAMI_USER" -c "set -eu
		export HOME='$STATE_DIR'
		export PNPM_HOME='$STATE_DIR/.pnpm'
		export PATH=\"\$PNPM_HOME:$UMAMI_DIR/node_modules/.bin:\$PATH\"
		export NEXT_TELEMETRY_DISABLED=1
		cd '$UMAMI_DIR'
		$*"
}

psql_root() { su postgres -c "psql -v ON_ERROR_STOP=1 -X -q -d postgres"; }

rand_pw() { openssl rand -base64 36 | tr -d '/+=:@\n' | cut -c1-32; }

# --- Steps ------------------------------------------------------------------

preflight() {
	log "Preflight"
	[ "$(id -u)" = 0 ] || die "run as root"
	[ -f /etc/alpine-release ] || die "this script targets Alpine Linux"
	info "Alpine $(cat /etc/alpine-release)"

	mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
	info "RAM ${mem_mb} MiB, free disk $(df -Pm / | awk 'NR==2 {print $4}') MiB on /"
	if [ "$mem_mb" -lt 3500 ]; then
		warn "The Next.js build wants ~3-4 GiB. With ${mem_mb} MiB it may be"
		warn "OOM-killed. Raise the LXC memory for the build, lower it after."
	fi
}

install_packages() {
	log "Installing packages"
	apk add --no-cache \
		nodejs npm git curl ca-certificates openssl tzdata logrotate \
		libc6-compat \
		postgresql17 postgresql17-client postgresql17-openrc

	node_major=$(node -p 'process.versions.node.split(".")[0]')
	# Prisma 7 and Next 16 both require Node >= 20.9; upstream builds on 22.
	[ "$node_major" -ge 22 ] || die "Node >= 22 required, found $(node -v)"
	info "node $(node -v), postgres $(pg_config --version 2>/dev/null || echo 17)"

	if ! pnpm --version 2>/dev/null | grep -qx "$PNPM_VERSION"; then
		info "installing pnpm@${PNPM_VERSION}"
		npm install -g "pnpm@${PNPM_VERSION}" >/dev/null
	fi
	info "pnpm $(pnpm --version)"
}

create_user() {
	log "Service user"
	getent group "$UMAMI_GROUP" >/dev/null || addgroup -S "$UMAMI_GROUP"
	getent passwd "$UMAMI_USER" >/dev/null || adduser -S -D -H \
		-h "$STATE_DIR" -s /sbin/nologin -G "$UMAMI_GROUP" \
		-g "Umami analytics" "$UMAMI_USER"
	install -d -o "$UMAMI_USER" -g "$UMAMI_GROUP" -m 0750 "$STATE_DIR"
	install -d -o "$UMAMI_USER" -g "$UMAMI_GROUP" -m 0755 "$LOG_DIR"
	install -d -o root -g root -m 0750 "$BACKUP_DIR"
	install -d -o root -g root -m 0755 /etc/umami
}

setup_postgres() {
	log "PostgreSQL"
	rc-update add postgresql default >/dev/null 2>&1 || true
	# Alpine's init script runs initdb on first start (auto_setup=yes).
	rc-service postgresql start >/dev/null 2>&1 || true

	i=0
	while ! su postgres -c 'pg_isready -q' 2>/dev/null; do
		i=$((i + 1))
		[ "$i" -lt 30 ] || die "postgres did not become ready"
		sleep 1
	done
	info "postgres is up"

	# pg_hba is first-match, so the rule has to go *above* whatever initdb
	# wrote for 127.0.0.1 (which defaults to trust). Insert, do not append.
	hba=/etc/postgresql/pg_hba.conf
	if [ -f "$hba" ] && ! grep -q 'umami analytics (setup.sh)' "$hba"; then
		info "adding scram rule for ${DB_USER}@127.0.0.1 to pg_hba.conf"
		awk -v line="host    ${DB_NAME}    ${DB_USER}    127.0.0.1/32    scram-sha-256" '
			!done && /^host/ { print "# umami analytics (setup.sh)"; print line; done = 1 }
			{ print }
		' "$hba" > "$hba.new"
		cat "$hba.new" > "$hba" && rm -f "$hba.new"
		rc-service postgresql reload >/dev/null
	fi
}

# Reads an existing password out of the env file so re-runs do not rotate it.
resolve_db_password() {
	if [ -f "$ENV_FILE" ]; then
		DB_PASSWORD=$(sed -n 's|^DATABASE_URL=postgresql://[^:]*:\([^@]*\)@.*|\1|p' "$ENV_FILE")
		[ -n "$DB_PASSWORD" ] || die "cannot parse the password out of DATABASE_URL in $ENV_FILE — fix it or move the file aside"
		info "reusing the database password from $ENV_FILE"
	else
		DB_PASSWORD=$(rand_pw)
		info "generated a new database password"
	fi
}

setup_database() {
	log "Database ${DB_NAME}"
	psql_root <<-SQL
		DO \$\$
		BEGIN
		  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
		    CREATE ROLE ${DB_USER} LOGIN;
		  END IF;
		END
		\$\$;
		ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
	SQL

	if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1; then
		su postgres -c "createdb -O ${DB_USER} -E UTF8 ${DB_NAME}"
		info "created database ${DB_NAME}"
	fi
	# Upstream recommends UTC so timestamps do not shift with the host zone.
	psql_root <<-SQL
		ALTER DATABASE ${DB_NAME} SET timezone TO 'UTC';
	SQL
}

write_env() {
	log "Environment file ${ENV_FILE}"
	if [ -f "$ENV_FILE" ]; then
		info "exists — left untouched (delete it to regenerate secrets)"
		return
	fi

	(umask 077; cat > "$ENV_FILE") <<-EOF
		# Umami runtime environment. Generated by infra/umami/setup.sh.
		# Read twice: by OpenRC (/etc/conf.d/umami sources it) and by the build
		# and maintenance scripts via the ${UMAMI_DIR}/.env symlink.
		# Contains secrets — never commit, never world-readable.

		DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}

		# Signs the session JWTs. Changing it logs everyone out.
		APP_SECRET=$(openssl rand -hex 32)

		# Enables TOTP two-factor auth. The dashboard is publicly reachable,
		# so turn 2FA on for every account in the UI after first login.
		TWO_FACTOR_ENCRYPTION_KEY=$(openssl rand -hex 32)

		# No outbound calls: neither usage telemetry nor version pings.
		DISABLE_TELEMETRY=1
		NEXT_TELEMETRY_DISABLED=1
		DISABLE_UPDATES=1

		NODE_ENV=production
		HOSTNAME=${BIND_HOST}
		PORT=${BIND_PORT}
		TZ=UTC

		# The GeoLite2 lookup resolves relative to process.cwd() otherwise,
		# which is the standalone directory, not the checkout.
		GEOLITE_DB_PATH=${UMAMI_DIR}/geo/GeoLite2-City.mmdb

		# Behind the reverse proxy the socket peer is the proxy, not the client.
		CLIENT_IP_HEADER=x-forwarded-for

		# Rotates the session hash salt monthly: the same visitor gets a new
		# pseudonymous id every month, which is what makes the setup
		# defensible without a consent banner.
		SALT_ROTATION=month
	EOF
	chown root:"$UMAMI_GROUP" "$ENV_FILE"
	chmod 0640 "$ENV_FILE"
	info "written, 0640 root:${UMAMI_GROUP}"
}

fetch_source() {
	log "Umami ${UMAMI_VERSION} source"
	git config --global --add safe.directory "$UMAMI_DIR" 2>/dev/null || true

	if [ ! -d "$UMAMI_DIR/.git" ]; then
		install -d -o "$UMAMI_USER" -g "$UMAMI_GROUP" -m 0755 "$UMAMI_DIR"
		git clone --depth 1 --branch "$UMAMI_VERSION" \
			https://github.com/umami-software/umami.git "$UMAMI_DIR"
	else
		git -C "$UMAMI_DIR" fetch --depth 1 origin "refs/tags/${UMAMI_VERSION}:refs/tags/${UMAMI_VERSION}" 2>/dev/null || true
		git -C "$UMAMI_DIR" checkout -f "$UMAMI_VERSION"
	fi
	chown -R "$UMAMI_USER":"$UMAMI_GROUP" "$UMAMI_DIR"

	# dotenv (build + maintenance scripts) looks for .env in the checkout.
	# Ignored by Umami's .gitignore, so `git checkout -f` will not remove it.
	ln -sfn "$ENV_FILE" "$UMAMI_DIR/.env"

	# Same relaxation the upstream Dockerfile applies: pnpm 12 otherwise
	# aborts the install over dependency build scripts that are not listed
	# in allowBuilds. Re-applied after every checkout.
	if ! grep -q '^strictDepBuilds:' "$UMAMI_DIR/pnpm-workspace.yaml"; then
		printf 'strictDepBuilds: false\n' >> "$UMAMI_DIR/pnpm-workspace.yaml"
	fi
	info "$(git -C "$UMAMI_DIR" describe --tags --always)"
}

build_app() {
	log "Building (this takes a while and downloads the GeoLite2 database)"
	# pnpm does not read .env, so NODE_ENV=production in the env file cannot
	# strip devDependencies here — the build needs them.
	as_umami "pnpm install --frozen-lockfile"
	# `pnpm build` also runs check:db, which applies pending Prisma
	# migrations — on a fresh database that is what creates the schema.
	as_umami "pnpm build"
}

link_runtime() {
	log "Wiring the standalone runtime"
	sa="$UMAMI_DIR/.next/standalone"
	[ -f "$sa/server.js" ] || die "no standalone server at $sa — did the build fail?"

	# `next build` writes .next/standalone without public/ and .next/static.
	# Upstream's Dockerfile copies them plus prisma/ and generated/ next to
	# server.js; symlinks do the same without duplicating the files, and are
	# recreated after every build because .next/standalone is rewritten.
	mkdir -p "$sa/.next"
	ln -sfn "$UMAMI_DIR/public" "$sa/public"
	ln -sfn "$UMAMI_DIR/generated" "$sa/generated"
	ln -sfn "$UMAMI_DIR/prisma" "$sa/prisma"
	ln -sfn "$UMAMI_DIR/.next/static" "$sa/.next/static"
	chown -h "$UMAMI_USER":"$UMAMI_GROUP" \
		"$sa/public" "$sa/generated" "$sa/prisma" "$sa/.next/static"
}

install_service() {
	log "OpenRC service"
	cat > /etc/init.d/umami <<-'INITD'
		#!/sbin/openrc-run
		# Umami analytics. Installed by infra/umami/setup.sh — edit there.

		description="Umami analytics (Next.js standalone server)"

		: ${umami_dir:=/opt/umami}
		: ${umami_user:=umami}
		: ${umami_group:=umami}
		: ${umami_home:=/var/lib/umami}
		: ${umami_env_file:=/etc/umami/umami.env}
		: ${run_migrations:=yes}

		supervisor=supervise-daemon
		command=/usr/bin/node
		command_args=server.js
		command_user="${umami_user}:${umami_group}"
		directory="${umami_dir}/.next/standalone"
		pidfile=/run/umami.pid
		output_log=/var/log/umami/umami.log
		error_log=/var/log/umami/umami.err
		respawn_delay=5
		respawn_max=0

		depend() {
		    need net
		    after postgresql
		    use dns logger
		}

		start_pre() {
		    if [ ! -r "$umami_env_file" ]; then
		        eerror "missing or unreadable $umami_env_file"
		        return 1
		    fi
		    checkpath -d -m 0755 -o "${umami_user}:${umami_group}" /var/log/umami || return 1

		    # Same order the upstream container uses: migrate, then serve.
		    # Runs from the checkout (not the standalone dir) because that is
		    # where node_modules, prisma/ and the .env symlink live.
		    if yesno "$run_migrations"; then
		        ebegin "Applying pending Umami database migrations"
		        su -s /bin/sh "$umami_user" -c \
		            "cd '$umami_dir' && HOME='$umami_home' PATH=\"$umami_dir/node_modules/.bin:\$PATH\" node scripts/check-db.js"
		        eend $? "migration failed" || return 1
		    fi
		}
	INITD
	chmod 0755 /etc/init.d/umami

	if [ ! -f /etc/conf.d/umami ]; then
		cat > /etc/conf.d/umami <<-'CONFD'
			# Configuration for /etc/init.d/umami.
			#
			# The secrets live in /etc/umami/umami.env (0640 root:umami). `set -a`
			# exports everything sourced from it, so supervise-daemon hands the
			# variables to the node process. Keep them out of this file — conf.d
			# is world-readable on Alpine.

			set -a
			[ -r /etc/umami/umami.env ] && . /etc/umami/umami.env
			set +a

			#umami_dir=/opt/umami
			#run_migrations=yes
		CONFD
		chmod 0644 /etc/conf.d/umami
	fi

	cat > /etc/logrotate.d/umami <<-LOGROTATE
		${LOG_DIR}/*.log ${LOG_DIR}/*.err {
		    weekly
		    rotate 8
		    missingok
		    notifempty
		    compress
		    delaycompress
		    copytruncate
		    su ${UMAMI_USER} ${UMAMI_GROUP}
		}
	LOGROTATE
	chmod 0644 /etc/logrotate.d/umami

	rc-update add umami default >/dev/null 2>&1 || true
}

install_cron() {
	log "Backup and retention cron"
	rc-update add crond default >/dev/null 2>&1 || true
	rc-service crond start >/dev/null 2>&1 || true
	# busybox crond runs these via run-parts; the dirs exist on a stock
	# Alpine, but not in every minimal LXC template.
	install -d /etc/periodic/daily /etc/periodic/monthly

	cat > /etc/periodic/daily/umami-backup <<-BACKUP
		#!/bin/sh
		# Nightly logical backup of the Umami database.
		set -eu
		dest=${BACKUP_DIR}
		install -d -m 0750 "\$dest"
		su postgres -c "pg_dump -Fc ${DB_NAME}" > "\$dest/${DB_NAME}-\$(date +%F).dump"
		find "\$dest" -name '${DB_NAME}-*.dump' -mtime +${BACKUP_KEEP_DAYS} -delete
	BACKUP
	chmod 0750 /etc/periodic/daily/umami-backup

	# Umami ships no retention job. Delete order follows the foreign keys:
	# Prisma generates ON DELETE RESTRICT for these relations, so children
	# have to go before their parents. Sessions are only removed once nothing
	# newer still references them.
	cat > /etc/periodic/monthly/umami-retention <<-RETENTION
		#!/bin/sh
		# Drops raw event data older than ${RETENTION_MONTHS} months.
		# Verified against the Umami ${UMAMI_VERSION} schema — re-check the table
		# names after a major upgrade.
		set -eu
		su postgres -c "psql -v ON_ERROR_STOP=1 -X -q -d ${DB_NAME}" <<-'SQL'
			BEGIN;
			DELETE FROM event_data            WHERE created_at < now() - interval '${RETENTION_MONTHS} months';
			DELETE FROM website_event         WHERE created_at < now() - interval '${RETENTION_MONTHS} months';
			DELETE FROM session_data          WHERE created_at < now() - interval '${RETENTION_MONTHS} months';
			DELETE FROM revenue               WHERE created_at < now() - interval '${RETENTION_MONTHS} months';
			DELETE FROM session_replay        WHERE created_at < now() - interval '${RETENTION_MONTHS} months';
			DELETE FROM session_replay_saved  WHERE created_at < now() - interval '${RETENTION_MONTHS} months';
			DELETE FROM heatmap_event         WHERE created_at < now() - interval '${RETENTION_MONTHS} months';
			DELETE FROM session_link          WHERE created_at < now() - interval '${RETENTION_MONTHS} months';
			DELETE FROM session s
			 WHERE s.created_at < now() - interval '${RETENTION_MONTHS} months'
			   AND NOT EXISTS (SELECT 1 FROM website_event e WHERE e.session_id = s.session_id)
			   AND NOT EXISTS (SELECT 1 FROM session_data d  WHERE d.session_id = s.session_id)
			   AND NOT EXISTS (SELECT 1 FROM revenue r       WHERE r.session_id = s.session_id);
			COMMIT;
		SQL
	RETENTION
	chmod 0750 /etc/periodic/monthly/umami-retention
}

start_service() {
	log "Starting umami"
	rc-service umami restart

	i=0
	while ! curl -fsS "http://127.0.0.1:${BIND_PORT}/api/heartbeat" >/dev/null 2>&1; do
		i=$((i + 1))
		if [ "$i" -ge 60 ]; then
			# Not fatal: everything is installed, so print the summary anyway
			# and let the operator look at the log.
			warn "no heartbeat after 60s — check: tail -n 50 ${LOG_DIR}/umami.err"
			return 0
		fi
		sleep 1
	done
	info "heartbeat OK on port ${BIND_PORT}"
}

summary() {
	ip=$(ip -4 -o addr show scope global 2>/dev/null | awk 'NR==1 {split($4, a, "/"); print a[1]}')
	cat <<-EOF

		────────────────────────────────────────────────────────────────────
		 Umami ${UMAMI_VERSION} is running on http://${ip:-<lxc-ip>}:${BIND_PORT}

		 Next, in this order:
		   1. Log in with admin / umami and change the password immediately.
		      The dashboard will be publicly reachable — treat the default
		      credentials as a live incident until they are gone.
		   2. Enable two-factor auth for the account (Profile → Security).
		   3. Create the website "Jahrweiser" and note its websiteId — that
		      value goes into UMAMI_WEBSITE_ID in the Nuxt app's .env.
		   4. Point analytics.webcraft-media.de at this box on the reverse
		      proxy: infra/umami/nginx-analytics.conf.
		   5. Leave session replay and heatmaps OFF per website. They record
		      DOM mutations and form input and are not consent-free.

		 Service:    rc-service umami {start,stop,restart,status}
		 Logs:       tail -f ${LOG_DIR}/umami.log ${LOG_DIR}/umami.err
		 Secrets:    ${ENV_FILE}
		 Upgrade:    ./update.sh vX.Y.Z
		────────────────────────────────────────────────────────────────────
	EOF
}

# --- Run --------------------------------------------------------------------

preflight
install_packages
create_user
setup_postgres
resolve_db_password
setup_database
write_env
fetch_source
build_app
link_runtime
install_service
install_cron
start_service
summary
