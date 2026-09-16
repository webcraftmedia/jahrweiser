// The process name is deliberately not `jahrweiser-app`, even though the
// directory is now `app/`: deploy.sh stops the service by this name, so renaming
// it would leave the running process up, and the new one would find port 3000
// taken. Changing it needs a one-off `pm2 delete jahrweiser-frontend` on the box
// first — which is a manual step on a production host, for a cosmetic gain.
module.exports = {
  apps: [{
    name: "jahrweiser-frontend",
    script: ".output/server/index.mjs",
    node_args: "-r dotenv/config",
    env_file: ".env" 
  }]
}