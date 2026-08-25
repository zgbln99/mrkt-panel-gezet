#!/usr/bin/env bash
#
# Wypisuje wszystko, co potrzebne do skierowania domeny na ten serwer:
# adresy maszyny, adres publiczny sieci i gotowe wartości do formularza DNS.
#
#   bash deploy/dns-info.sh mrkt.gezet.pl
#
# Nie zmienia niczego w systemie — samo sprawdzenie.

set -uo pipefail

DOMAIN="${1:-}"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m! %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }

PRIVATE_V4="$(ip -4 addr show scope global 2>/dev/null | awk '/inet /{sub(/\/.*/,"",$2); print $2; exit}')"
GLOBAL_V6="$(ip -6 addr show scope global 2>/dev/null | awk '/inet6 /{sub(/\/.*/,"",$2); print $2; exit}')"
PUBLIC_V4="$(curl -4 -fsS --max-time 6 https://api.ipify.org 2>/dev/null \
    || curl -4 -fsS --max-time 6 https://ifconfig.me/ip 2>/dev/null \
    || curl -4 -fsS --max-time 6 https://icanhazip.com 2>/dev/null \
    || true)"
PUBLIC_V4="$(tr -d '[:space:]' <<< "$PUBLIC_V4")"

# IPv6 oceniamy osobno: to niezależna warstwa sieci i serwer schowany za NAT-em
# na IPv4 może mieć jednocześnie w pełni publiczny, routowany adres IPv6.
PUBLIC_V6="$(curl -6 -fsS --max-time 6 https://api6.ipify.org 2>/dev/null \
    || curl -6 -fsS --max-time 6 https://ifconfig.me/ip 2>/dev/null \
    || true)"
PUBLIC_V6="$(tr -d '[:space:]' <<< "$PUBLIC_V6")"

# Adres z 2000::/3 to publiczna przestrzeń IPv6 (nie fd00::/8 ani fe80::/10).
IPV6_PUBLIC=0
if [[ "$GLOBAL_V6" =~ ^[23] ]]; then IPV6_PUBLIC=1; fi

echo
bold "Adresy tego serwera"
echo "  na interfejsie (IPv4): ${PRIVATE_V4:-brak}"
echo "  na interfejsie (IPv6): ${GLOBAL_V6:-brak}"
echo "  widziany z internetu (IPv4): ${PUBLIC_V4:-nie udało się ustalić}"
echo "  widziany z internetu (IPv6): ${PUBLIC_V6:-brak łączności IPv6}"
echo

BEHIND_NAT=0
if [[ "$PRIVATE_V4" =~ ^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.) ]]; then
    BEHIND_NAT=1
fi

TARGET="$PRIVATE_V4"

if [[ $BEHIND_NAT -eq 1 ]]; then
    warn "Serwer stoi za NAT-em — adres $PRIVATE_V4 działa tylko w sieci lokalnej."
    warn "W DNS trzeba wpisać adres publiczny, a na routerze przekierować porty."
    TARGET="${PUBLIC_V4:-<PUBLICZNY-ADRES-TWOJEJ-SIECI>}"

    if [[ "$PUBLIC_V4" =~ ^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\. ]]; then
        echo
        warn "Adres $PUBLIC_V4 pochodzi z puli CGNAT operatora."
        warn "Takiego adresu NIE da się przekierować — połączenia przychodzące"
        warn "z internetu w ogóle do Was nie dotrą. Potrzebny będzie publiczny"
        warn "adres od operatora albo tunel (np. Cloudflare Tunnel)."
    fi
    echo
    bold "Na routerze przekieruj (port forwarding):"
    echo "  80/TCP   →  $PRIVATE_V4:80"
    echo "  443/TCP  →  $PRIVATE_V4:443"
else
    ok "Serwer ma publiczny adres IPv4 — przekierowanie portów niepotrzebne."
fi

echo
bold "Rekord DNS do założenia${DOMAIN:+ dla $DOMAIN}"
echo "  Typ rekordu:  A"
echo "  Adres IPv4:   $TARGET"
if [[ -n "$DOMAIN" ]]; then
    echo "  Host:         (zostaw puste — rekord dotyczy wtedy $DOMAIN)"
else
    echo "  Host:         (puste = sama domena; wpisz nazwę tylko dla głębszej subdomeny)"
fi
echo "  TTL:          300"
echo

# Rekord AAAA zależy WYŁĄCZNIE od tego, czy serwer ma publiczny, routowany
# adres IPv6 — z NAT-em na IPv4 nie ma to nic wspólnego.
if [[ $IPV6_PUBLIC -eq 1 ]]; then
    bold "Rekord AAAA (IPv6) — dopiero po sprawdzeniu"
    echo "  Typ rekordu:  AAAA"
    echo "  Adres IPv6:   $GLOBAL_V6"
    if [[ "$PUBLIC_V6" == "$GLOBAL_V6" ]]; then
        ok "Serwer wychodzi do internetu tym samym adresem — IPv6 nie jest NAT-owane."
    elif [[ -n "$PUBLIC_V6" ]]; then
        warn "Serwer wychodzi innym adresem IPv6 ($PUBLIC_V6) — sprawdź, czy $GLOBAL_V6"
        warn "jest osiągalny z zewnątrz, zanim założysz rekord AAAA."
    else
        warn "Brak łączności IPv6 na zewnątrz — rekordu AAAA na razie nie zakładaj."
    fi
    echo
    warn "WAŻNE: Let's Encrypt przy istniejącym rekordzie AAAA próbuje walidacji"
    warn "najpierw po IPv6. Jeśli ruch przychodzący po IPv6 nie dochodzi, certyfikat"
    warn "nie zostanie wystawiony — mimo poprawnie działającego IPv4."
    warn "Bezpieczna kolejność: najpierw uruchom wszystko na IPv4, a rekord AAAA"
    warn "dodaj później i od razu sprawdź, czy certyfikat nadal się odnawia."
    echo
else
    warn "Nie zakładaj rekordu AAAA — ten serwer nie ma publicznego adresu IPv6."
    echo
fi

if [[ -n "$DOMAIN" ]]; then
    RESOLVED="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
    bold "Stan DNS w tej chwili"
    if [[ -z "$RESOLVED" ]]; then
        echo "  $DOMAIN — brak rekordu A (albo jeszcze się nie rozpropagował)"
    else
        echo "  $DOMAIN → $RESOLVED"
        COUNT="$(wc -w <<< "$RESOLVED")"
        if [[ -n "$TARGET" ]] && grep -qw "$TARGET" <<< "$RESOLVED"; then
            if (( COUNT > 1 )); then
                # Przy dwóch rekordach A ruch rozkłada się między adresy, więc
                # część osób trafi w stary hosting, a walidacja certyfikatu
                # będzie się udawać losowo.
                warn "Domena ma $COUNT rekordy A. Zostaw wyłącznie $TARGET —"
                warn "przy kilku adresach ruch rozkłada się między nie, a Let's Encrypt"
                warn "trafi czasem na zły serwer i certyfikat nie zostanie wystawiony."
            else
                ok "Zgadza się z adresem docelowym."
            fi
        else
            warn "Wskazuje na inny adres niż $TARGET."
            warn "Podmień istniejący rekord A zamiast dodawać kolejny."
        fi
    fi
    echo
fi

if [[ $BEHIND_NAT -eq 1 && -n "$PUBLIC_V4" && -n "$DOMAIN" ]]; then
    bold "Jak sprawdzić przekierowanie portów (z innego komputera lub telefonu w sieci komórkowej)"
    echo "  curl -H \"Host: $DOMAIN\" http://$PUBLIC_V4/api/health"
    echo
    echo "  Samo otwarcie http://$PUBLIC_V4/ w przeglądarce NIE zadziała i tak ma być:"
    echo "  nginx odrzuca żądania bez pasującej nazwy hosta (patrz README, Bezpieczeństwo)."
    echo
fi

bold "Gdy DNS zacznie wskazywać poprawnie"
echo "  sudo bash deploy/install.sh ${DOMAIN:-twoja.domena.pl}"
echo
