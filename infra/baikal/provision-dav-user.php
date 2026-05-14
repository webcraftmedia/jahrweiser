<?php
/**
 * Inserts a DAV principal + user (digest auth) + default addressbook into
 * Baikal's SQLite database. Idempotent. Designed to be executed inside the
 * baikal container via:
 *
 *   docker compose exec baikal php /var/www/baikal/Specific/provision-dav-user.php
 *
 * Args (all optional, defaults shown):
 *   $1  username      = admin
 *   $2  password      = admin
 *   $3  email         = admin@example.com
 *   $4  displayname   = Admin
 *
 * The first invocation also seeds Baikal's schema from the bundled
 * Core/Distrib/SQLDefinitions/sqlite/*.sql files — Baikal would otherwise
 * create those tables lazily on first HTTP request.
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

// 1) Make sure the schema exists. Baikal ships SQL files under
//    Core/Distrib/SQLDefinitions/sqlite — apply each statement, ignore
//    "already exists" errors. We also probe alternate locations because
//    Baikal has moved this path between minor versions.
$candidates = [
    '/var/www/baikal/Core/Distrib/SQLDefinitions/sqlite',
    '/var/www/baikal/Core/Distrib/SQL/sqlite',
];
$schemaDir = null;
foreach ($candidates as $c) {
    if (is_dir($c)) { $schemaDir = $c; break; }
}
if ($schemaDir === null) {
    // Last-ditch: find anything that looks right.
    $hit = shell_exec("find /var/www/baikal -type d -path '*SQLDefinitions/sqlite' 2>/dev/null | head -1");
    if ($hit) $schemaDir = trim($hit);
}

if ($schemaDir) {
    foreach (glob("$schemaDir/*.sql") as $f) {
        $sql = (string) file_get_contents($f);
        foreach (preg_split('/;\s*\n/', $sql) as $stmt) {
            $stmt = trim($stmt);
            if ($stmt === '') continue;
            try { $db->exec($stmt); } catch (PDOException $e) { /* idempotent */ }
        }
    }
    echo "[provision] schema applied from $schemaDir\n";
} else {
    echo "[provision] WARN: no schema dir found, assuming Baikal already initialized the DB\n";
}

// 2) Insert principal, digest auth row, and default addressbook. INSERT OR
//    IGNORE makes re-runs cheap and harmless.
$db->prepare("INSERT OR IGNORE INTO principals (uri, email, displayname) VALUES (?, ?, ?)")
   ->execute(["principals/$username", $email, $displayname]);
$db->prepare("INSERT OR IGNORE INTO users (username, digesta1) VALUES (?, ?)")
   ->execute([$username, $digesta1]);
$db->prepare("INSERT OR IGNORE INTO addressbooks (principaluri, displayname, uri, description, synctoken) VALUES (?, ?, ?, ?, 1)")
   ->execute(["principals/$username", 'Default Address Book', 'default', 'Default Address Book']);

echo "[provision] DAV user '$username' + default addressbook ready (password: '$password')\n";
