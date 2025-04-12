module.exports = {
  apps: [{
    name: 'scoop',
    script: 'stall.js',
    cwd: __dirname,
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 4000,
    env: {
      NODE_ENV: 'production'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    error_file: 'logs/error.log',
    out_file: 'logs/output.log',
    merge_logs: true,
    time: true
  }]
}; 