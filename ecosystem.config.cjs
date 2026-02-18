module.exports = {
  apps: [{
    name: 'trevor',
    script: 'src/index.ts',
    interpreter: 'bun',
    args: '--from 18:00 --to 19:00 --day tue',
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
