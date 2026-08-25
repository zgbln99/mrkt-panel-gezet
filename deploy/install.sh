#!/usr/bin/env bash
#
# Instalacja aplikacji "Zgłoszenia Marketing Gezet" na czystym VPS-ie
# (Ubuntu 22.04/24.04 lub Debian 12).
#
#   sudo bash deploy/install.sh marketing.twoja-firma.pl
#
# Skrypt jest idempotentny — można go uruchomić ponownie po nieudanej próbie
# albo po zmianie domeny; istniejącej bazy i pliku .env nie nadpisuje.
#
# Co robi:
#   1. instaluje Node.js 22, nginx, certbot i ufw
#   2. zakłada systemowe konto "gezet" (aplikacja nie działa jako root)
#   3. kopiuje pliki do /var/www/gezet-marketing i buduje frontend
#   4. generuje .env z losowym JWT_SECRET (jeśli jeszcze go nie ma)
#   5. zakłada konta zespołu i wypisuje hasła startowe (przy pierwszym uruchomieniu)
#   6. uruchamia usługę systemd + codzienną kopię zapasową
#   7. konfiguruje nginx, firewall i certyfikat HTTPS

set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="/var/www/gezet-marketing"
APP_USER="gezet"
NODE_MAJOR=22

info()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()   { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Uruchom przez sudo: sudo bash deploy/install.sh twoja-domena.pl"
[[ -n "$DOMAIN" ]] || die "Podaj domenę: sudo bash deploy/install.sh marketing.twoja-firma.pl"

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -d "$SOURCE_DIR/server" && -d "$SOURCE_DIR/client" ]] || die "Nie znaleziono katalogów server/ i client/ obok skryptu."

# ── 1. pakiety systemowe ───────────────────────────────────────────────
info "Instaluję pakiety systemowe"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg nginx ufw rsync

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]]; then
    info "Instaluję Node.js ${NODE_MAJOR}.x z NodeSource"
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y -qq nodejs
fi
echo "  Node.js: $(node -v)"

# ── 2. konto systemowe ─────────────────────────────────────────────────
if ! id -u "$APP_USER" >/dev/null 2>&1; then
    info "Zakładam konto systemowe '$APP_USER'"
    # --system: konto bez możliwości logowania, wyłącznie do uruchamiania usługi
    useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

# ── 3. pliki aplikacji ─────────────────────────────────────────────────
info "Kopiuję pliki do $APP_DIR"
mkdir -p "$APP_DIR" "$APP_DIR/backups" /var/log/gezet-marketing

if [[ "$(readlink -f "$SOURCE_DIR")" != "$(readlink -f "$APP_DIR")" ]]; then
    # --exclude .env i data/: konfiguracja i baza na serwerze są ważniejsze
    # niż to, co przyjechało z repozytorium.
    rsync -a --delete \
        --exclude 'node_modules' --exclude 'dist' --exclude '.git' \
        --exclude 'data' --exclude 'backups' --exclude '.env' \
        "$SOURCE_DIR/" "$APP_DIR/"
fi

# ── 4. konfiguracja ────────────────────────────────────────────────────
ENV_FILE="$APP_DIR/server/.env"
if [[ -f "$ENV_FILE" ]]; then
    info "Plik server/.env już istnieje — zostawiam bez zmian"
else
    info "Tworzę server/.env z losowym JWT_SECRET"
    SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')"
    cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
JWT_SECRET=$SECRET
JWT_EXPIRES_IN=7d
DB_PATH=$APP_DIR/server/data/gezet.db
CLIENT_ORIGIN=
TRUST_PROXY=1
BCRYPT_ROUNDS=12
LOG_REQUESTS=true
EOF
    chmod 600 "$ENV_FILE"
fi

# ── 5. zależności i build ──────────────────────────────────────────────
info "Instaluję zależności backendu"
cd "$APP_DIR/server"
npm ci --omit=dev --no-audit --no-fund

info "Buduję frontend (to może chwilę potrwać)"
cd "$APP_DIR/client"
npm ci --no-audit --no-fund
npm run build
# devDependencies frontendu (Vite) są potrzebne wyłącznie do builda.
rm -rf node_modules

chown -R "$APP_USER:$APP_USER" "$APP_DIR" /var/log/gezet-marketing
chmod 600 "$ENV_FILE"

# ── 6. konta zespołu ───────────────────────────────────────────────────
DB_FILE="$APP_DIR/server/data/gezet.db"
if [[ -f "$DB_FILE" ]]; then
    info "Baza już istnieje — pomijam zakładanie kont"
else
    info "Zakładam konta zespołu"
    cd "$APP_DIR/server"
    sudo -u "$APP_USER" node scripts/seed.js
    warn "Zapisz powyższe hasła startowe TERAZ — nie da się ich odczytać później."
fi

# ── 7. usługi systemd ──────────────────────────────────────────────────
info "Konfiguruję usługę systemd"
install -m 644 "$APP_DIR/deploy/gezet-marketing.service" /etc/systemd/system/
install -m 644 "$APP_DIR/deploy/gezet-backup.service"    /etc/systemd/system/
install -m 644 "$APP_DIR/deploy/gezet-backup.timer"      /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now gezet-marketing
systemctl enable --now gezet-backup.timer
systemctl restart gezet-marketing

# ── 8. nginx ───────────────────────────────────────────────────────────
info "Konfiguruję nginx dla domeny $DOMAIN"
sed "s/TWOJA-DOMENA.PL/$DOMAIN/g" "$APP_DIR/deploy/nginx.conf" \
    > /etc/nginx/sites-available/gezet-marketing
ln -sf /etc/nginx/sites-available/gezet-marketing /etc/nginx/sites-enabled/gezet-marketing
# Domyślna strona nginx-a przechwytywałaby żądania bez pasującego server_name.
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# ── 9. firewall ────────────────────────────────────────────────────────
info "Konfiguruję firewall (ufw)"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
echo "  Port 4000 pozostaje zamknięty dla świata — API jest dostępne wyłącznie przez nginx."

# ── 10. weryfikacja ────────────────────────────────────────────────────
info "Sprawdzam, czy aplikacja odpowiada"
for _ in $(seq 1 20); do
    if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
        echo "  API odpowiada: $(curl -fsS http://127.0.0.1:4000/api/health)"
        break
    fi
    sleep 1
done
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 \
    || die "API nie odpowiada. Sprawdź: journalctl -u gezet-marketing -n 50"

# ── 11. HTTPS ──────────────────────────────────────────────────────────
info "Konfiguruję certyfikat HTTPS (Let's Encrypt)"
if apt-get install -y -qq certbot python3-certbot-nginx; then
    if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
        echo "  HTTPS działa, certyfikat będzie odnawiany automatycznie."
    else
        warn "Nie udało się automatycznie wystawić certyfikatu."
        warn "Najczęstsza przyczyna: domena $DOMAIN nie wskazuje jeszcze na ten serwer."
        warn "Po poprawieniu DNS uruchom: sudo certbot --nginx -d $DOMAIN"
    fi
fi

cat <<EOF

────────────────────────────────────────────────────────────────
 Gotowe. Aplikacja działa pod adresem: https://$DOMAIN
────────────────────────────────────────────────────────────────

 Przydatne komendy:
   systemctl status gezet-marketing      stan usługi
   journalctl -u gezet-marketing -f      logi na żywo
   systemctl restart gezet-marketing     restart
   sudo bash $APP_DIR/deploy/update.sh   wdrożenie nowej wersji

 Pierwsze kroki:
   1. Otwórz https://$DOMAIN i kliknij ikonę kłódki w prawym górnym rogu.
   2. Zaloguj się hasłem startowym — aplikacja od razu poprosi o zmianę.
   3. Przekaż pozostałym osobom ich hasła startowe.

EOF
