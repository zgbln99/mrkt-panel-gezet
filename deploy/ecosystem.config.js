/**
 * Konfiguracja PM2 — alternatywa dla systemd, jeśli wolisz to narzędzie.
 *
 *   cd /var/www/gezet-marketing
 *   pm2 start deploy/ecosystem.config.js
 *   pm2 save
 *   pm2 startup     # wykonaj wypisaną komendę, żeby PM2 wstał po reboocie
 *
 * Pojedyncza instancja jest tu zamierzona: SQLite w trybie WAL obsługuje
 * wielu czytelników, ale zapisy serializuje. Tryb `cluster` z kilkoma
 * procesami nie zwiększyłby przepustowości, a mnożyłby blokady na pliku bazy.
 */
module.exports = {
  apps: [
    {
      name: 'gezet-api',
      cwd: '/var/www/gezet-marketing/server',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
      kill_timeout: 15000, // czas na domknięcie bazy po SIGTERM
      error_file: '/var/log/gezet-marketing/error.log',
      out_file: '/var/log/gezet-marketing/out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
