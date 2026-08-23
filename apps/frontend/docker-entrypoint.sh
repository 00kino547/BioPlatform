#!/bin/sh
set -e

HTML_DIR="${HTML_DIR:-/usr/share/nginx/html}"

VITE_VARS="VITE_API_URL VITE_APP_NAME VITE_APP_TAGLINE VITE_APP_DESCRIPTION VITE_APP_URL VITE_APP_GITHUB_URL VITE_APP_OG_IMAGE VITE_CONTACT_URL VITE_STATUS_URL VITE_DOCS_URL"

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

sed_escape() {
  printf '%s' "$1" | sed -e 's/[|&\\]/\\&/g'
}

{
  printf 'window.__APP_CONFIG__ = {\n'
  first=1
  for key in $VITE_VARS; do
    value=$(printenv "$key" || true)
    [ -n "$value" ] || continue
    if [ "$first" -eq 1 ]; then
      first=0
    else
      printf ',\n'
    fi
    printf '  "%s": "%s"' "$key" "$(json_escape "$value")"
  done
  printf '\n};\n'
} > "$HTML_DIR/env.js"

for key in $VITE_VARS; do
  value=$(printenv "$key" || true)
  [ -n "$value" ] || continue
  sed -i "s|%${key}%|$(sed_escape "$value")|g" "$HTML_DIR/index.html"
done
