module.exports = {
  apps: [{
    name: "jahrweiser-frontend",
    script: ".output/server/index.mjs",
    node_args: "-r dotenv/config",
    env_file: ".env" 
  }]
}