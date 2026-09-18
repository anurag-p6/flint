#!/usr/bin/env bash
# Flip the browser origin between localhost and a tunnel URL.
#   ./scripts/switch-origin.sh localhost
#   ./scripts/switch-origin.sh https://xxx.trycloudflare.com
# APP_URL is intentionally untouched (server-to-server keeper trigger).
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-}"
if [ "$MODE" = "localhost" ]; then
  URL="http://localhost:3000"
elif [[ "$MODE" =~ ^https?:// ]]; then
  URL="$MODE"
else
  echo "usage: $0 localhost | https://<tunnel-url>"
  exit 1
fi

for VAR in NEXTAUTH_URL NEXT_PUBLIC_APP_URL; do
  if grep -q "^${VAR}=" .env; then
    sed -i "s|^${VAR}=.*|${VAR}=${URL}|" .env
  else
    echo "${VAR}=${URL}" >> .env
  fi
done

echo "origin -> ${URL}"
echo "NEXT:"
echo "  1) restart dev server (env change)"
echo "  2) set OAuth App callback to ${URL}/api/auth/callback/github"
echo "  3) hard-refresh the browser (Ctrl+Shift+R)"
