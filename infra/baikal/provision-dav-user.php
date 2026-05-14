<?php
/**
 * Provisions Baikal's SQLite DB with the sabre/dav v4 schema (idempotent),
 * then inserts a DAV principal + digest-auth user + default addressbook.
 *
 * Designed to be executed inside the baikal container:
 *   docker compose exec baikal php /tmp/provision-dav-user.php
 *
 * Args (all optional, defaults shown):
 *   $1  username      = admin
 *   $2  password      = admin
 *   $3  email         = admin@example.com
 *   $4  displayname   = Admin
 */

$username    = $argv[1] ?? 'admin';
$password    = $argv[2] ?? 'admin';
$email       = $argv[3] ?? 'admin@example.com';
$displayname = $argv[4] ?? 'Admin';
$realm       = 'BaikalDAV';

$digesta1 = md5("$username:$realm:$password");
$dbFile   = '/var/www/baikal/Specific/db/db.sqlite';

$db = new PDO("sqlite:$dbFile");
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('PRAGMA foreign_keys = OFF');

// Sabre/dav v4 SQLite schema (CardDAV + CalDAV + auth + locks). CREATE IF
// NOT EXISTS makes re-runs cheap. Mirrors the canonical schema from
// sabre/dav-4.x — including the calendar tables, otherwise Baikal's admin
// UI complains when listing users.
$schemaStmts = [
'CREATE TABLE IF NOT EXISTS principals (
    id integer primary key asc not null,
    uri text not null,
    email text,
    displayname text,
    UNIQUE(uri)
)',
'CREATE TABLE IF NOT EXISTS groupmembers (
    id integer primary key asc not null,
    principal_id integer not null,
    member_id integer not null,
    UNIQUE(principal_id, member_id)
)',
'CREATE TABLE IF NOT EXISTS users (
    id integer primary key asc not null,
    username TEXT NOT NULL,
    digesta1 TEXT NOT NULL,
    UNIQUE(username)
)',
'CREATE TABLE IF NOT EXISTS calendars (
    id integer primary key asc NOT NULL,
    synctoken integer DEFAULT 1 NOT NULL,
    components text NOT NULL
)',
'CREATE TABLE IF NOT EXISTS calendarinstances (
    id integer primary key asc NOT NULL,
    calendarid integer,
    principaluri text,
    access integer NOT NULL DEFAULT 1,
    displayname text,
    uri text NOT NULL,
    description text,
    calendarorder integer NOT NULL DEFAULT 0,
    calendarcolor text,
    timezone text,
    transparent bool NOT NULL DEFAULT 0,
    share_href text,
    share_displayname text,
    share_invitestatus integer NOT NULL DEFAULT 2,
    UNIQUE(principaluri, uri),
    UNIQUE(calendarid, principaluri),
    UNIQUE(calendarid, share_href)
)',
'CREATE TABLE IF NOT EXISTS calendarobjects (
    id integer primary key asc NOT NULL,
    calendardata blob,
    uri text,
    calendarid integer,
    lastmodified integer,
    etag text,
    size integer,
    componenttype text,
    firstoccurence integer,
    lastoccurence integer,
    uid text
)',
'CREATE TABLE IF NOT EXISTS calendarchanges (
    id integer primary key asc NOT NULL,
    uri text,
    synctoken integer not null,
    calendarid integer not null,
    operation tinyint
)',
'CREATE TABLE IF NOT EXISTS calendarsubscriptions (
    id integer primary key asc NOT NULL,
    uri text NOT NULL,
    principaluri text NOT NULL,
    source text NOT NULL,
    displayname text,
    refreshrate text,
    calendarorder integer NOT NULL DEFAULT 0,
    calendarcolor text,
    striptodos bool,
    stripalarms bool,
    stripattachments bool,
    lastmodified int,
    UNIQUE(principaluri, uri)
)',
'CREATE TABLE IF NOT EXISTS schedulingobjects (
    id integer primary key asc NOT NULL,
    principaluri text,
    calendardata blob,
    uri text,
    lastmodified integer,
    etag text,
    size integer
)',
'CREATE TABLE IF NOT EXISTS addressbooks (
    id integer primary key asc not null,
    principaluri text not null,
    displayname text,
    uri text not null,
    description text,
    synctoken integer DEFAULT 1 NOT NULL,
    UNIQUE(principaluri, uri)
)',
'CREATE TABLE IF NOT EXISTS cards (
    id integer primary key asc not null,
    addressbookid integer not null,
    carddata blob,
    uri text not null,
    lastmodified integer,
    etag text,
    size integer
)',
'CREATE TABLE IF NOT EXISTS addressbookchanges (
    id integer primary key asc not null,
    uri text,
    synctoken integer not null,
    addressbookid integer not null,
    operation tinyint not null
)',
'CREATE TABLE IF NOT EXISTS locks (
    id integer primary key asc not null,
    owner text,
    timeout integer,
    created integer,
    token text,
    scope tinyint,
    depth tinyint,
    uri text
)',
'CREATE TABLE IF NOT EXISTS propertystorage (
    id integer primary key asc not null,
    path text,
    name text,
    valuetype integer,
    value blob
)',
'CREATE UNIQUE INDEX IF NOT EXISTS path_property ON propertystorage (path, name)',
]
;

foreach ($schemaStmts as $stmt) {
    try { $db->exec($stmt); } catch (PDOException $e) { /* idempotent */ }
}
echo "[provision] schema ensured\n";

// Insert principal, digest user, default addressbook. Re-runs are no-ops.
$db->prepare('INSERT OR IGNORE INTO principals (uri, email, displayname) VALUES (?, ?, ?)')
   ->execute(["principals/$username", $email, $displayname]);
$db->prepare('INSERT OR IGNORE INTO users (username, digesta1) VALUES (?, ?)')
   ->execute([$username, $digesta1]);
$db->prepare('INSERT OR IGNORE INTO addressbooks (principaluri, displayname, uri, description, synctoken) VALUES (?, ?, ?, ?, 1)')
   ->execute(["principals/$username", 'Default Address Book', 'default', 'Default Address Book']);

echo "[provision] DAV user '$username' + default addressbook ready (password: '$password')\n";
