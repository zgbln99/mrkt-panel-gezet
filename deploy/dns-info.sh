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

echo
bold "Adresy tego serwera"
echo "  na interfejsie (IPv4): ${PRIVATE_V4:-brak}"
echo "  na interfejsie (IPv6): ${GLOBAL_V6:-brak}"
echo "  widziany z internetu : ${PUBLIC_V4:-nie udało się ustalić}"
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

if [[ -n "$GLOBAL_V6" && $BEHIND_NAT -eq 0 ]]; then
    echo "  Opcjonalnie dodatkowo:"
    echo "  Typ rekordu:  AAAA"
    echo "  Adres IPv6:   $GLOBAL_V6"
    echo
else
    warn "Nie zakładaj rekordu AAAA — ten serwer nie ma osiągalnego z zewnątrz IPv6."
    echo
fi

if [[ -n "$DOMAIN" ]]; then
    RESOLVED="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
    bold "Stan DNS w tej chwili"
    if [[ -z "$RESOLVED" ]]; then
        echo "  $DOMAIN — brak rekordu A (albo jeszcze się nie rozpropagował)"
    else
        echo "  $DOMAIN → $RESOLVED"
        if [[ -n "$TARGET" ]] && grep -qw "$TARGET" <<< "$RESOLVED"; then
            ok "Zgadza się z adresem docelowym."
        else
            warn "Wskazuje na inny adres niż $TARGET."
        fi
    fi
    echo
fi

bold "Gdy DNS zacznie wskazywać poprawnie"
echo "  sudo bash deploy/install.sh ${DOMAIN:-twoja.domena.pl}"
echo
