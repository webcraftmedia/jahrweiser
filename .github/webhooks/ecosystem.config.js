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
    node_args: "-r dotenv/config",
    env_file: ".env"
  }]
}
