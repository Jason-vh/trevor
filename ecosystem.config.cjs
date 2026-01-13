module.exports = {
  apps: [
    {
      name: 'trevor',
      script: 'src/index.ts',
      interpreter: 'bun',
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        TZ: 'Europe/Amsterdam'
      }
    }
  ]
};
