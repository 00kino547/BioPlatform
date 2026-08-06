#!/bin/sh
set -e

mode=${TLS_MODE:-development}
dir=/etc/nginx/certs
cert=$dir/cert.pem
key=$dir/key.pem

have_openssl=0
if command -v openssl >/dev/null 2>&1; then
  have_openssl=1
fi

has_files() {
  [ -f "$cert" ] && [ -f "$key" ]
}

is_valid() {
  has_files || return 1
  if [ "$have_openssl" = "1" ]; then
    openssl x509 -in "$cert" -noout -checkend 0 >/dev/null 2>&1 || return 1
    openssl x509 -in "$cert" -noout -pubkey >/dev/null 2>&1 || return 1
  fi
  return 0
}

case "$mode" in
  production)
    if ! is_valid; then
      echo "TLS_MODE=production requires a valid certificate/key pair." >&2
      echo "Place cert.pem and key.pem in ./certs/ (or set TLS_MODE=development to auto-generate self-signed certs)." >&2
      exit 1
    fi
    ;;
  *)
    if ! is_valid; then
      if [ "$have_openssl" = "0" ]; then
        echo "Installing openssl to generate a self-signed certificate..."
        apk add --no-cache openssl >/dev/null 2>&1 || exit 1
      fi
      echo "Generating self-signed certificate (development mode) into $dir..."
      openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
        -keyout "$key" -out "$cert" \
        -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
      echo "Self-signed certificate generated: $cert"
    fi
    ;;
esac

exec /docker-entrypoint.sh "$@"
