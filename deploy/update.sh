#!/usr/bin/env bash
#
# Wdrożenie nowej wersji na działającym serwerze.
#
#   sudo bash /var/www/gezet-marketing/deploy/update.sh
#
# Kolejność ma znaczenie: najpierw kopia zapasowa, potem build frontendu
# (jeszcze na starej, działającej wersji), a restart backendu na samym końcu —
# dzięki temu ewentualny błąd builda nie zostawia serwisu w połowie wdrożenia.

set -euo pipefail

APP_DIR="/var/www/gezet-marketing"
APP_USER="gezet"

info() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Uruchom przez sudo."
[[ -d "$APP_DIR/server" ]] || die "Nie znaleziono $APP_DIR/server."

cd "$APP_DIR"

info "Kopia zapasowa bazy przed aktualizacją"
sudo -u "$APP_USER" node server/scripts/backup.js "$APP_DIR/backups"

if [[ -d .git ]]; then
    info "Pobieram zmiany z repozytorium"
    git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
    git pull --ff-only
fi

info "Aktualizuję zależności backendu"
cd "$APP_DIR/server"
npm ci --omit=dev --no-audit --no-fund

info "Buduję frontend"
cd "$APP_DIR/client"
npm ci --no-audit --no-fund
npm run build
rm -rf node_modules

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 600 "$APP_DIR/server/.env"

info "Restartuję usługę"
systemctl restart gezet-marketing

for _ in $(seq 1 20); do
    if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
        info "Gotowe — $(curl -fsS http://127.0.0.1:4000/api/health)"
        exit 0
    fi
    sleep 1
done

die "Aplikacja nie odpowiada po restarcie. Sprawdź: journalctl -u gezet-marketing -n 50"
