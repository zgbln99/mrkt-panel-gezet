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

# Część hostingów nie daje portów 80 i 443 na IPv4 (adres jest współdzielony),
# tylko kilka własnych portów — numery bywają w powitaniu po zalogowaniu.
SHARED_PORTS="$(grep -hoE '[a-z0-9.-]+\.mikrus\.xyz:[0-9]+' \
    /etc/motd /etc/motd.d/* /etc/update-motd.d/* /root/.motd 2>/dev/null \
    | grep -oE '[0-9]+$' | sort -un | tr '\n' ' ')"

GATEWAY_V4="$(ip route 2>/dev/null | awk '/^default/{print $3; exit}')"
GATEWAY_V6="$(ip -6 route 2>/dev/null | awk '/^default/{print $3; exit}')"
IFACE="$(ip route 2>/dev/null | awk '/^default/{print $5; exit}')"

echo
bold "Adresy tego serwera"
echo "  na interfejsie (IPv4): ${PRIVATE_V4:-brak}"
echo "  na interfejsie (IPv6): ${GLOBAL_V6:-brak}"
echo "  widziany z internetu (IPv4): ${PUBLIC_V4:-nie udało się ustalić}"
echo "  widziany z internetu (IPv6): ${PUBLIC_V6:-brak łączności IPv6}"
echo

echo
bold "Kto pośredniczy w ruchu"
echo "  brama domyślna (IPv4): ${GATEWAY_V4:-brak}   interfejs: ${IFACE:-?}"
echo "  brama domyślna (IPv6): ${GATEWAY_V6:-brak}"
echo

BEHIND_NAT=0
if [[ "$PRIVATE_V4" =~ ^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.) ]]; then
    BEHIND_NAT=1
fi

TARGET="$PRIVATE_V4"

if [[ $BEHIND_NAT -eq 1 ]]; then
    if [[ -n "$SHARED_PORTS" ]]; then
        warn "Serwer nie ma własnego adresu IPv4 — korzysta ze współdzielonego."
    else
        warn "Serwer stoi za NAT-em — adres $PRIVATE_V4 działa tylko w sieci lokalnej."
        warn "W DNS trzeba wpisać adres publiczny, a na routerze przekierować porty."
    fi
    TARGET="${PUBLIC_V4:-<PUBLICZNY-ADRES-TWOJEJ-SIECI>}"

    if [[ "$PUBLIC_V4" =~ ^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\. ]]; then
        echo
        warn "Adres $PUBLIC_V4 pochodzi z puli CGNAT operatora."
        warn "Takiego adresu NIE da się przekierować — połączenia przychodzące"
        warn "z internetu w ogóle do Was nie dotrą. Potrzebny będzie publiczny"
        warn "adres od operatora albo tunel (np. Cloudflare Tunnel)."
    fi
    if [[ -n "$SHARED_PORTS" ]]; then
        # Hosting ze współdzielonym IPv4 — przekierowania portów nie ma jak
        # ustawić, bo porty 80 i 443 należą do dostawcy, nie do nas.
        echo
        bold "To hosting ze współdzielonym adresem IPv4"
        echo "  Przydzielone Wam porty TCP: $SHARED_PORTS"
        echo "  Portów 80 i 443 na IPv4 nie da się użyć — należą do dostawcy."
        echo
        echo "  Działająca konfiguracja:"
        echo "    • aplikacja na przydzielonym porcie — dostępna po IPv4 i IPv6"
        echo "    • certyfikat wydany przez walidację po IPv6 (tam port 80 jest Wasz)"
        echo "    • rekord AAAA jest OBOWIĄZKOWY, bez niego certyfikatu nie będzie"
        echo
        echo "  Instalacja:"
        echo "    sudo HTTPS_PORT=${SHARED_PORTS%% *} bash deploy/install.sh ${DOMAIN:-twoja.domena.pl}"
        echo
        echo "  Adres dla zespołu: https://${DOMAIN:-twoja.domena.pl}:${SHARED_PORTS%% *}"
        echo
    else
    echo
    bold "Przekierowanie portów trzeba ustawić NIE tutaj, tylko na urządzeniu"
    bold "o adresie ${GATEWAY_V4:-<brama domyślna>} — to ono ma adres publiczny $PUBLIC_V4."
    echo "  Ma przekazywać:  80/TCP → $PRIVATE_V4:80   i   443/TCP → $PRIVATE_V4:443"
    echo
    echo "  Czym jest ta brama, zależy od tego, jak postawiono serwer:"
    echo "    • host wirtualizacji (Proxmox/libvirt) → reguła iptables DNAT na hoście"
    echo "    • osobna maszyna-brama w tej sieci     → konfiguracja na niej"
    echo "    • fizyczny router                      → panel routera"
    echo
    echo "  Nie masz do niej dostępu? Zostają dwie drogi bez przekierowania portów:"
    echo "    • wyłącznie IPv6 (rekord AAAA) — działa od ręki, ale klienci bez IPv6 nie wejdą"
    echo "    • tunel (np. Cloudflare Tunnel) — połączenie wychodzi z serwera, działa dla wszystkich"
    fi
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
    if [[ -n "$SHARED_PORTS" ]]; then
        bold "Rekord AAAA (IPv6) — OBOWIĄZKOWY przy współdzielonym IPv4"
    else
        bold "Rekord AAAA (IPv6) — dopiero po sprawdzeniu"
    fi
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
    if [[ -n "$SHARED_PORTS" ]]; then
        warn "Przy współdzielonym IPv4 rekord AAAA NIE jest opcjonalny: to jedyna droga,"
        warn "którą Let's Encrypt potwierdzi, że serwer należy do Was."
    else
        warn "WAŻNE: Let's Encrypt przy istniejącym rekordzie AAAA próbuje walidacji"
        warn "najpierw po IPv6. Jeśli ruch przychodzący po IPv6 nie dochodzi, certyfikat"
        warn "nie zostanie wystawiony — mimo poprawnie działającego IPv4."
        warn "Bezpieczna kolejność: najpierw uruchom wszystko na IPv4, a rekord AAAA"
        warn "dodaj później i od razu sprawdź, czy certyfikat nadal się odnawia."
    fi
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

if [[ -n "$DOMAIN" ]]; then
    if [[ -n "$SHARED_PORTS" ]]; then
        bold "Jak sprawdzić dostępność po instalacji (z dowolnego komputera)"
        echo "  curl https://$DOMAIN:${SHARED_PORTS%% *}/api/health"
        echo
        echo "  Samo https://$DOMAIN (bez portu) zadziała wyłącznie z sieci z IPv6 —"
        echo "  na IPv4 port 443 należy do dostawcy hostingu, nie do Was."
        echo
    elif [[ $BEHIND_NAT -eq 1 && -n "$PUBLIC_V4" ]]; then
        bold "Jak sprawdzić przekierowanie portów (z innego komputera lub telefonu w sieci komórkowej)"
        echo "  curl -H \"Host: $DOMAIN\" http://$PUBLIC_V4/api/health"
        echo
        echo "  Samo otwarcie http://$PUBLIC_V4/ w przeglądarce NIE zadziała i tak ma być:"
        echo "  nginx odrzuca żądania bez pasującej nazwy hosta (patrz README, Bezpieczeństwo)."
        echo
    fi
fi

bold "Gdy DNS zacznie wskazywać poprawnie"
if [[ -n "$SHARED_PORTS" ]]; then
    echo "  sudo HTTPS_PORT=${SHARED_PORTS%% *} bash deploy/install.sh ${DOMAIN:-twoja.domena.pl}"
else
    echo "  sudo bash deploy/install.sh ${DOMAIN:-twoja.domena.pl}"
fi
echo
