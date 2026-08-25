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
[[ -n "$DOMAIN" ]] || die "Podaj domenę albo adres IPv4: sudo bash deploy/install.sh 203.0.113.10"

# Skrypt obsługuje dwa tryby: domenę i sam adres IPv4 (gdy domeny jeszcze nie ma).
# Let's Encrypt wydaje certyfikaty także dla adresów IP — są jednak krótsze
# (160 godzin) i wymagają nowszego certbota niż ten z repozytorium Ubuntu.
if [[ "$DOMAIN" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    MODE="ip"
    for octet in ${DOMAIN//./ }; do
        (( octet <= 255 )) || die "\"$DOMAIN\" nie jest poprawnym adresem IPv4."
    done
else
    MODE="domain"
    # Domena z przykładu w dokumentacji nie należy do nikogo z nas — wpisana
    # dosłownie kończy się nieudaną walidacją certyfikatu i zużyciem limitu prób
    # w Let's Encrypt.
    if [[ "$DOMAIN" =~ (twoja-firma\.pl|TWOJA-DOMENA|przyklad\.pl|example\.com)$ ]]; then
        die "\"$DOMAIN\" to domena z przykładu w dokumentacji. Podaj własną, np. panel.gezet.pl"
    fi
fi

# Trzeci tryb: hosting, który nie daje portów 80 i 443 na IPv4, tylko kilka
# własnych portów na adresie współdzielonym (tak działa m.in. Mikr.us).
# Aplikacja stoi wtedy na przydzielonym porcie, a certyfikat wydaje się przez
# walidację po IPv6, gdzie port 80 należy już do nas.
detect_shared_hosting_port() {
    # Numery portów bywają wypisane w powitaniu po zalogowaniu.
    grep -hoE '[a-z0-9.-]+\.mikrus\.xyz:[0-9]+' \
        /etc/motd /etc/motd.d/* /etc/update-motd.d/* /root/.motd 2>/dev/null \
        | grep -oE '[0-9]+$' | sort -un | tail -1
}

if [[ "$MODE" == "domain" ]]; then
    if [[ -z "${HTTPS_PORT:-}" ]]; then
        HTTPS_PORT="$(detect_shared_hosting_port || true)"
        [[ -n "$HTTPS_PORT" ]] && echo "Wykryto przydzielony port TCP: $HTTPS_PORT (nadpiszesz zmienną HTTPS_PORT)"
    fi
    if [[ -n "${HTTPS_PORT:-}" ]]; then
        [[ "$HTTPS_PORT" =~ ^[0-9]+$ ]] && (( HTTPS_PORT > 0 && HTTPS_PORT < 65536 )) \
            || die "HTTPS_PORT=\"$HTTPS_PORT\" nie jest poprawnym numerem portu."
        MODE="port"
    fi
fi

if [[ "$MODE" == "port" ]]; then
    BASE_URL="https://$DOMAIN:$HTTPS_PORT"
else
    BASE_URL="https://$DOMAIN"
fi

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
# Katalog bazy musi istnieć PRZED startem usługi: ProtectSystem=strict czyni
# /var/www tylko do odczytu, więc aplikacja nie utworzyłaby go sama.
mkdir -p "$APP_DIR" "$APP_DIR/server/data" "$APP_DIR/backups" /var/log/gezet-marketing

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

# Kod aplikacji zostaje własnością roota — konto usługi ma go wyłącznie czytać.
# Zapisywalne jest tylko to, co aplikacja naprawdę zapisuje: baza i kopie
# zapasowe. Dzięki temu przejęty proces aplikacji nie nadpisze własnego kodu
# ani nie podłoży hooka w .git/hooks, który wykonałby się z prawami roota
# przy najbliższym `git pull` w update.sh.
# Skutek uboczny: katalog repozytorium należy do roota, więc git nie zgłasza
# przy nim ostrzeżenia "detected dubious ownership".
chown -R root:root "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/server/data" "$APP_DIR/backups" /var/log/gezet-marketing

# .env czyta konto usługi (przez grupę), ale nie może go zmienić.
chown root:"$APP_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

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
NODE_BIN="$(command -v node)"
echo "  node: $NODE_BIN"
# Jednostki mają w repozytorium /usr/bin/node; podmieniamy na ścieżkę wykrytą
# w systemie, żeby instalacja z nvm albo z innego repozytorium też wstała.
for unit in gezet-marketing.service gezet-backup.service; do
    sed "s|^ExecStart=/usr/bin/node|ExecStart=$NODE_BIN|" "$APP_DIR/deploy/$unit" \
        > "/etc/systemd/system/$unit"
    chmod 644 "/etc/systemd/system/$unit"
done
install -m 644 "$APP_DIR/deploy/gezet-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now gezet-marketing
systemctl enable --now gezet-backup.timer
systemctl restart gezet-marketing

# ── 8. nginx ───────────────────────────────────────────────────────────
NGINX_SITE=/etc/nginx/sites-available/gezet-marketing
ACME_ROOT=/var/www/letsencrypt
mkdir -p "$ACME_ROOT/.well-known/acme-challenge"

# Adresy tego serwera — potrzebne i do sprawdzenia DNS, i do podpowiedzi,
# jakie rekordy założyć.
SERVER_IPV4="$(ip -4 addr show scope global 2>/dev/null | awk '/inet /{sub(/\/.*/,"",$2); print $2; exit}')"
SERVER_IPV6="$(ip -6 addr show scope global 2>/dev/null | awk '/inet6 /{sub(/\/.*/,"",$2); print $2; exit}')"

if [[ "$MODE" == "port" ]]; then
    info "Konfiguruję nginx dla $DOMAIN na porcie $HTTPS_PORT"
    # Wariant startowy: bez TLS, bo certyfikatu jeszcze nie ma, a nginx nie
    # wstałby wskazując na nieistniejące pliki. Docelowa konfiguracja wchodzi
    # po wydaniu certyfikatu (krok 11).
    cat > "$NGINX_SITE" <<NGINXCONF
server {
    listen [::]:80;
    listen 0.0.0.0:$HTTPS_PORT;
    listen [::]:$HTTPS_PORT;
    server_name $DOMAIN;
    server_tokens off;
    client_max_body_size 512k;

    location ^~ /.well-known/acme-challenge/ {
        root $ACME_ROOT;
        default_type "text/plain";
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXCONF
elif [[ "$MODE" == "domain" ]]; then
    info "Konfiguruję nginx dla domeny $DOMAIN"
    sed "s/TWOJA-DOMENA.PL/$DOMAIN/g" "$APP_DIR/deploy/nginx.conf" > "$NGINX_SITE"

    # Nasłuch IPv6 jest w szablonie zakomentowany, bo na serwerze bez IPv6
    # wywala nginx-a przy starcie. Skoro ten serwer IPv6 ma — włączamy go.
    # Inaczej rekord AAAA założony odruchowo obok A kierowałby część urządzeń
    # (te wolące IPv6) na port, którego nikt nie słucha.
    if [[ -n "$SERVER_IPV6" ]]; then
        echo "  wykryto IPv6 ($SERVER_IPV6) — włączam nasłuch IPv6"
        sed -i \
            -e 's|^    # listen \[::\]:80 default_server;|    listen [::]:80 default_server;|' \
            -e 's|^    # listen \[::\]:80;|    listen [::]:80;|' \
            "$NGINX_SITE"
    else
        echo "  brak globalnego IPv6 — nie zakładaj rekordu AAAA dla tej domeny"
    fi
else
    info "Konfiguruję nginx dla adresu $DOMAIN (bez domeny)"
    # Wariant przejściowy: sam HTTP. Docelowa konfiguracja z TLS wymaga
    # istniejącego certyfikatu — bez niego nginx nie wystartuje, więc
    # wgrywamy ją dopiero po jego wydaniu (krok 11).
    cat > "$NGINX_SITE" <<NGINXCONF
server {
    listen 80 default_server;
    server_name _;
    server_tokens off;
    client_max_body_size 512k;

    location ^~ /.well-known/acme-challenge/ {
        root $ACME_ROOT;
        default_type "text/plain";
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXCONF
fi

ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/gezet-marketing
# Domyślna strona nginx-a przechwytywałaby żądania bez pasującego server_name.
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# ── 9. firewall ────────────────────────────────────────────────────────
if command -v ufw >/dev/null 2>&1; then
    info "Konfiguruję firewall (ufw)"
    ufw allow OpenSSH >/dev/null
    ufw allow 'Nginx Full' >/dev/null
    # W trybie portowym aplikacja słucha na przydzielonym porcie, a nie na 443 —
    # bez tej reguły ufw odciąłby ją zaraz po włączeniu.
    [[ "$MODE" == "port" ]] && ufw allow "$HTTPS_PORT/tcp" >/dev/null
    ufw --force enable >/dev/null
    echo "  Port 4000 pozostaje zamknięty dla świata — API jest dostępne wyłącznie przez nginx."
else
    warn "Nie znaleziono ufw — pomijam konfigurację firewalla."
fi

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

if [[ "$MODE" == "port" ]]; then
    info "Konfiguruję certyfikat HTTPS dla $DOMAIN"

    # Na współdzielonym IPv4 port 80 nie należy do nas, więc Let's Encrypt musi
    # dojść po IPv6 — a to wymaga rekordu AAAA wskazującego na ten serwer.
    RESOLVED_V6="$(getent ahostsv6 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u)"

    if [[ -z "$SERVER_IPV6" ]]; then
        warn "Ten serwer nie ma publicznego adresu IPv6 — nie ma jak wydać certyfikatu."
        warn "Na współdzielonym adresie IPv4 port 80 należy do dostawcy hostingu."
        BASE_URL="http://$DOMAIN:$HTTPS_PORT"
    elif [[ -z "$RESOLVED_V6" ]]; then
        warn "Domena $DOMAIN nie ma rekordu AAAA — pomijam certyfikat."
        warn "Załóż rekord:  AAAA  $DOMAIN  →  $SERVER_IPV6"
        warn "Bez niego Let's Encrypt nie ma jak potwierdzić, że serwer jest Wasz:"
        warn "na współdzielonym IPv4 port 80 obsługuje dostawca hostingu, nie Wy."
        warn "Po propagacji uruchom skrypt ponownie."
        BASE_URL="http://$DOMAIN:$HTTPS_PORT"
    elif ! grep -qx "$SERVER_IPV6" <<< "$RESOLVED_V6"; then
        warn "Rekord AAAA domeny $DOMAIN wskazuje na inny adres niż ten serwer."
        warn "  w DNS:      $(tr '\n' ' ' <<< "$RESOLVED_V6")"
        warn "  ten serwer: $SERVER_IPV6"
        BASE_URL="http://$DOMAIN:$HTTPS_PORT"
    else
        info "Wystawiam certyfikat (walidacja po IPv6)"
        if apt-get install -y -qq certbot >/dev/null &&
           certbot certonly --webroot --webroot-path "$ACME_ROOT" -d "$DOMAIN" \
               --non-interactive --agree-tos --register-unsafely-without-email \
               --keep-until-expiring; then

            info "Włączam HTTPS w nginx"
            sed -e "s/DOMENA_APLIKACJI/$DOMAIN/g" -e "s/PORT_HTTPS/$HTTPS_PORT/g" \
                "$APP_DIR/deploy/nginx-mikrus.conf" > "$NGINX_SITE"
            nginx -t && systemctl reload nginx
            # Odnawianie obsługuje timer certbota z pakietu; dokładamy tylko
            # przeładowanie nginx po odnowieniu.
            mkdir -p /etc/letsencrypt/renewal-hooks/deploy
            printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
            chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
            echo "  Certyfikat wydany, odnawianie automatyczne."
        else
            warn "Nie udało się wystawić certyfikatu — aplikacja działa po HTTP."
            warn "Sprawdź, czy port 80 po IPv6 jest osiągalny z internetu."
            BASE_URL="http://$DOMAIN:$HTTPS_PORT"
        fi
    fi

elif [[ "$MODE" == "ip" ]]; then
    info "Konfiguruję certyfikat HTTPS dla adresu $DOMAIN"

    # Adres musi faktycznie należeć do tego serwera — Let's Encrypt sprawdzi to
    # w walidacji, a nieudane próby zużywają limit.
    if ! hostname -I 2>/dev/null | tr ' ' '\n' | grep -qx "$DOMAIN"; then
        warn "Adres $DOMAIN nie jest przypisany do tego serwera."
        warn "Adresy tej maszyny: $(hostname -I)"
        warn "Jeśli serwer stoi za NAT-em, przekieruj porty 80 i 443, po czym uruchom skrypt ponownie."
    fi

    # Certbot z repozytorium Ubuntu 24.04 to wersja 2.9 — nie zna certyfikatów
    # dla adresów IP. Potrzebna jest 5.4 lub nowsza (flaga --ip-address oraz
    # obsługa adresów IP we wtyczce webroot), więc w razie potrzeby instalujemy
    # go osobno, do własnego środowiska Pythona.
    certbot_version() { "$1" --version 2>&1 | awk '{print $2}'; }

    certbot_supports_ip() {
        local version="$1" major minor
        major="${version%%.*}"
        minor="$(cut -d. -f2 <<< "$version")"
        [[ "$major" =~ ^[0-9]+$ ]] || return 1
        (( major > 5 )) && return 0
        (( major == 5 )) && (( ${minor:-0} >= 4 )) && return 0
        return 1
    }

    CERTBOT_BIN=""
    for candidate in /usr/local/bin/certbot /opt/certbot/bin/certbot "$(command -v certbot 2>/dev/null || true)"; do
        [[ -n "$candidate" && -x "$candidate" ]] || continue
        if certbot_supports_ip "$(certbot_version "$candidate")"; then
            CERTBOT_BIN="$candidate"
            break
        fi
    done

    if [[ -z "$CERTBOT_BIN" ]]; then
        info "Instaluję certbota w wersji obsługującej adresy IP"
        apt-get install -y -qq python3-venv >/dev/null
        if python3 -m venv /opt/certbot >/dev/null 2>&1 &&
           /opt/certbot/bin/pip install --quiet --upgrade pip certbot >/dev/null 2>&1; then
            ln -sf /opt/certbot/bin/certbot /usr/local/bin/certbot
            certbot_supports_ip "$(certbot_version /opt/certbot/bin/certbot)" &&
                CERTBOT_BIN=/opt/certbot/bin/certbot
        fi
    fi

    if [[ -z "$CERTBOT_BIN" ]]; then
        warn "Nie udało się przygotować certbota obsługującego adresy IP (wymagana wersja 5.4+)."
        warn "Aplikacja działa po HTTP — hasła jadą wtedy otwartym tekstem, więc"
        warn "nie logujcie się z sieci publicznych, dopóki HTTPS nie zadziała."
        BASE_URL="http://$DOMAIN"
    else
        echo "  certbot: $(certbot_version "$CERTBOT_BIN")"

        # --preferred-profile shortlived: Let's Encrypt wydaje certyfikaty dla
        # adresów IP wyłącznie jako sześciodniowe.
        # --webroot: nginx nie musi być zatrzymywany na czas walidacji.
        if "$CERTBOT_BIN" certonly \
                --webroot --webroot-path "$ACME_ROOT" \
                --ip-address "$DOMAIN" \
                --preferred-profile shortlived \
                --cert-name gezet-ip \
                --non-interactive --agree-tos --register-unsafely-without-email \
                --keep-until-expiring; then

            info "Włączam HTTPS w nginx"
            sed "s/SERWER-IP/$DOMAIN/g" "$APP_DIR/deploy/nginx-ip.conf" > "$NGINX_SITE"
            nginx -t && systemctl reload nginx

            # Certyfikat jest ważny tylko 160 godzin, więc odnawianie musi
            # chodzić własnym timerem — bez niego aplikacja przestanie działać
            # w niecały tydzień.
            install -m 644 "$APP_DIR/deploy/gezet-certbot-renew.service" /etc/systemd/system/
            install -m 644 "$APP_DIR/deploy/gezet-certbot-renew.timer"   /etc/systemd/system/
            systemctl daemon-reload
            systemctl enable --now gezet-certbot-renew.timer
            echo "  Certyfikat ważny 6 dni, odnawiany automatycznie cztery razy na dobę."
        else
            warn "Nie udało się wystawić certyfikatu dla adresu $DOMAIN."
            warn "Sprawdź, czy port 80 jest osiągalny z internetu: curl http://$DOMAIN/.well-known/acme-challenge/test"
            warn "Aplikacja działa po HTTP — hasła jadą wtedy otwartym tekstem."
            BASE_URL="http://$DOMAIN"
        fi
    fi

else
    # Let's Encrypt liczy nieudane walidacje i po kilku próbach blokuje domenę na
    # godzinę. Zanim uruchomimy certbota, sprawdzamy więc sami, czy domena w ogóle
    # wskazuje na ten serwer — inaczej pierwsza literówka kosztuje godzinę czekania.
    domain_points_here() {
        local resolved acceptable
        resolved="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u)"
        [[ -z "$resolved" ]] && return 2   # brak rekordu A — nie ma czego porównywać

        # Za NAT-em domena wskazuje na adres routera, a nie na adres serwera —
        # dlatego akceptujemy jedno i drugie.
        acceptable="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$')"
        [[ -n "$PUBLIC_IP" ]] && acceptable="$acceptable
$PUBLIC_IP"

        while read -r ip; do
            [[ -z "$ip" ]] && continue
            grep -qx "$ip" <<< "$acceptable" && return 0
        done <<< "$resolved"
        return 1
    }

    if [[ "${SKIP_DNS_CHECK:-0}" == "1" ]]; then
        # Awaryjna furtka: gdy sprawdzenie myli się przy nietypowej sieci,
        # a wiemy, że ruch z internetu dochodzi na porty 80 i 443.
        warn "SKIP_DNS_CHECK=1 — pomijam sprawdzenie DNS i próbuję wystawić certyfikat."
        DNS_CHECK=0
    else
        domain_points_here
        DNS_CHECK=$?
    fi

    # Serwer bywa schowany za NAT-em (adres prywatny na interfejsie, publiczny
    # na routerze). Porównanie samych adresów lokalnych dałoby wtedy fałszywy
    # alarm, więc pytamy jeszcze, jakim adresem wychodzimy do internetu.
    PUBLIC_IP="$(curl -4 -fsS --max-time 6 https://api.ipify.org 2>/dev/null \
        || curl -4 -fsS --max-time 6 https://ifconfig.me/ip 2>/dev/null \
        || curl -4 -fsS --max-time 6 https://icanhazip.com 2>/dev/null \
        || true)"
    PUBLIC_IP="$(tr -d '[:space:]' <<< "$PUBLIC_IP")"

    dns_records_hint() {
        local target="$SERVER_IPV4"

        # Adres z RFC 1918 nie działa w publicznym DNS — trzeba wskazać adres,
        # którym serwer wychodzi do internetu, i przekierować na nim porty.
        if [[ "$SERVER_IPV4" =~ ^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.) ]]; then
            warn "Serwer ma adres prywatny ($SERVER_IPV4) — stoi za NAT-em."
            if [[ -n "$PUBLIC_IP" ]]; then
                target="$PUBLIC_IP"
                warn "Adres publiczny tej sieci: $PUBLIC_IP"
                if [[ "$PUBLIC_IP" =~ ^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\. ]]; then
                    warn "UWAGA: ten adres pochodzi z puli CGNAT operatora — połączeń"
                    warn "przychodzących nie da się na niego przekierować. Potrzebny będzie"
                    warn "tunel (np. Cloudflare Tunnel) albo publiczny adres od operatora."
                fi
            else
                target="<PUBLICZNY-ADRES-TWOJEJ-SIECI>"
                warn "Nie udało się ustalić adresu publicznego — sprawdź: curl -4 https://ifconfig.me"
            fi
            warn "Na routerze przekieruj porty 80 i 443 na $SERVER_IPV4."
        fi

        warn "Załóż w DNS takie rekordy dla $DOMAIN:"
        warn "    A     $DOMAIN   →  $target"
        if [[ -n "$SERVER_IPV6" ]]; then
            warn "    AAAA  $DOMAIN   →  $SERVER_IPV6     (opcjonalnie, patrz niżej)"
            warn "  Rekord AAAA dodawaj dopiero po uruchomieniu wszystkiego na IPv4:"
            warn "  Let's Encrypt przy istniejącym AAAA waliduje najpierw po IPv6 i gdy"
            warn "  ruch przychodzący po IPv6 nie dochodzi, certyfikat nie powstanie."
        else
            warn "    (bez rekordu AAAA — ten serwer nie ma globalnego IPv6)"
        fi
        warn "TTL na start ustaw nisko, np. 300 sekund."
        warn "Po propagacji uruchom: sudo certbot --nginx -d $DOMAIN"
        warn "Jeśli domena stoi za Cloudflare, na czas wystawiania certyfikatu wyłącz proxy (szara chmurka)."
    }

    if [[ $DNS_CHECK -eq 1 ]]; then
        warn "Domena $DOMAIN wskazuje na inny adres niż ten serwer — pomijam certyfikat."
        dns_records_hint
        BASE_URL="http://$DOMAIN"
    elif [[ $DNS_CHECK -eq 2 ]]; then
        warn "Domena $DOMAIN nie ma jeszcze rekordu A — pomijam certyfikat."
        dns_records_hint
        BASE_URL="http://$DOMAIN"
    else
        info "Konfiguruję certyfikat HTTPS (Let's Encrypt)"
        if apt-get install -y -qq certbot python3-certbot-nginx; then
            if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
                echo "  HTTPS działa, certyfikat będzie odnawiany automatycznie."
            else
                warn "Nie udało się automatycznie wystawić certyfikatu."
                warn "Po poprawieniu DNS uruchom: sudo certbot --nginx -d $DOMAIN"
                BASE_URL="http://$DOMAIN"
            fi
        fi
    fi
fi

cat <<EOF

────────────────────────────────────────────────────────────────
 Gotowe. Aplikacja działa pod adresem: $BASE_URL
────────────────────────────────────────────────────────────────

 Przydatne komendy:
   systemctl status gezet-marketing      stan usługi
   journalctl -u gezet-marketing -f      logi na żywo
   systemctl restart gezet-marketing     restart
   sudo bash $APP_DIR/deploy/update.sh   wdrożenie nowej wersji

 Pierwsze kroki:
   1. Otwórz $BASE_URL i kliknij ikonę kłódki w prawym górnym rogu.
   2. Zaloguj się hasłem startowym — aplikacja od razu poprosi o zmianę.
   3. Przekaż pozostałym osobom ich hasła startowe.

 Powiadomienia na telefony (aplikacja mobilna):
   Wgraj klucz konta usługi Firebase i dopisz go do konfiguracji:
     sudo mkdir -p /etc/gezet
     sudo install -o $APP_USER -g $APP_USER -m 600 klucz.json /etc/gezet/fcm.json
     echo 'FCM_SERVICE_ACCOUNT=/etc/gezet/fcm.json' | sudo tee -a $ENV_FILE
     sudo systemctl restart gezet-marketing
   Bez tego powiadomienia idą przekaźnikiem Expo. Sprawdzenie:
     curl -s $BASE_URL/api/health

 W aplikacji mobilnej wpisz jako adres serwera: $BASE_URL

EOF
