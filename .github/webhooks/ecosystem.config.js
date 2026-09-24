// Renamed from `jahrweiser-frontend` once the directory became `app/`.
//
// The name is what pm2 identifies the process by, and deploy.sh stops the old
// one explicitly before starting this — see the comment there. Do not rename it
// again without reading that first: a rename on its own leaves the running
// process up under its old name, holding port 3000 while the new one tries to
// bind it.
module.exports = {
  apps: [{
    name: "jahrweiser-app",
    script: ".output/server/index.mjs",
    // Node reads the file itself (>= 22.9) instead of preloading `dotenv/config`.
    // deploy.sh installs with `npm ci --omit=dev`, and dotenv is a
    // devDependency — so the preload resolved to nothing on the server and the
    // process died before it ever ran a line of app code, with a
    // MODULE_NOT_FOUND whose requireStack was `internal/preload`. Verified to
    // parse this .env identically to dotenv (same keys, same values).
    // `-if-exists` so a host that exports its variables some other way still
    // starts, rather than aborting over a file it does not need.
    node_args: "--env-file-if-exists=.env",
    env_file: ".env"
  }]
}
