module.exports = {
  apps: [{
    name: 'trevor',
    script: 'src/index.ts',
    interpreter: 'bun',
    args: '--from 17:15 --to 19:00 --day tue --day wed --day thu',
    cron_restart: '*/15 * * * *',
    autorestart: false,
    watch: false,
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      TZ: 'Europe/Amsterdam'
    }
  }]
};
