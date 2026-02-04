module.exports = {
  apps: [{
    name: 'trevor',
    script: 'src/index.ts',
    interpreter: 'bun',
    args: '--from 17:30 --to 20:00 --day tue --day wed',
    cron_restart: '*/5 * * * *',
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
