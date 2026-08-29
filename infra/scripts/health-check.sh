#!/usr/bin/env bash
# Health check for the Home Dashboard services. Exit 0 = healthy, 1 = unhealthy.
set -uo pipefail

API_URL="${API_URL:-http://127.0.0.1:8787}"
VOICE_URL="${VOICE_URL:-http://127.0.0.1:8788}"
fail=0

check() {
  local name="$1" url="$2"
  if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
    printf 'OK   %s\n' "$name"
  else
    printf 'FAIL %s\n' "$name"
    fail=1
  fi
}

check "api    $API_URL/api/health"   "$API_URL/api/health"
check "voice  $VOICE_URL/health"      "$VOICE_URL/health"
check "web    $API_URL/../ (nginx)"   "$API_URL/api/health"

exit "$fail"
