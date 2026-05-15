-- One-time DB bootstrap for the auth-sidecar.
--
-- Creates the application database and a least-privileged user. Schema
-- migrations (table creation) are NOT done here — they are run separately
-- via `npm run db:migrate` from the frontend directory.
--
-- Placeholders ${DB_NAME}, ${DB_USER}, ${DB_PASSWORD} are intended for
-- envsubst (see setup.sh). For manual use, replace them before running.
--
-- Idempotent: safe to re-run.

CREATE DATABASE IF NOT EXISTS `${DB_NAME}`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS '${DB_USER}'@'%'
  IDENTIFIED BY '${DB_PASSWORD}';

GRANT ALL PRIVILEGES ON `${DB_NAME}`.* TO '${DB_USER}'@'%';

FLUSH PRIVILEGES;
