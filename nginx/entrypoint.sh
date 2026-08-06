#!/bin/sh
set -e

mode=${TLS_MODE:-development}
send_hsts_on_dev=${SEND_HSTS_ON_DEV:-false}
dir=/etc/nginx/certs
self_cert=$dir/self-signed.pem
self_key=$dir/self-signed.key
cert=$dir/cert.pem
key=$dir/key.pem

have_openssl=0
if command -v openssl >/dev/null 2>&1; then
  have_openssl=1
fi

is_valid() {
  [ -f "$cert" ] && [ -f "$key" ] || return 1
  if [ "$have_openssl" = "1" ]; then
    openssl x509 -in "$cert" -noout -checkend 0 >/dev/null 2>&1 || return 1
    openssl x509 -in "$cert" -noout -pubkey >/dev/null 2>&1 || return 1
  fi
  return 0
}

remove_dev_certs() {
  rm -f "$self_cert" "$self_key"
  if [ -L "$cert" ]; then rm -f "$cert"; fi
  if [ -L "$key" ]; then rm -f "$key"; fi
}

case "$mode" in
  production)
    remove_dev_certs
    if ! is_valid; then
      echo "TLS_MODE=production requires a valid certificate/key pair." >&2
      echo "Place cert.pem and key.pem in ./certs/ (self-signed development certs are removed automatically)." >&2
      echo "Set TLS_MODE=development to auto-generate self-signed certs." >&2
      exit 1
    fi
    ;;
  *)
    remove_dev_certs
    if ! is_valid; then
      if [ "$have_openssl" = "0" ]; then
        echo "Installing openssl to generate a self-signed certificate..."
        apk add --no-cache openssl >/dev/null 2>&1 || exit 1
      fi
      echo "Generating self-signed certificate (development mode)..."
      openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
        -keyout "$self_key" -out "$self_cert" \
        -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
      ln -sf self-signed.pem "$cert"
      ln -sf self-signed.key "$key"
      echo "Self-signed certificate generated: $self_cert (symlinked to cert.pem/key.pem)"
    fi
    ;;
esac

hsts_conf=/etc/nginx/conf.d/hsts.conf
if [ "$mode" = "production" ] || [ "$send_hsts_on_dev" = "true" ]; then
  printf 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n' > "$hsts_conf"
else
  printf '# HSTS disabled (development mode, SEND_HSTS_ON_DEV not true)\n' > "$hsts_conf"
fi

exec /docker-entrypoint.sh "$@"
