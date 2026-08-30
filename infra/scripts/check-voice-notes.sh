#!/usr/bin/env bash
# Deployment check for voice-note storage. Verifies the API can WRITE its
# voice-note directory (mkdir -p + probe file) and that VOICE_NOTE_MAX_BYTES,
# when set, is a valid positive integer. Exit 0 = OK, 1 = failure.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Mirrors services/api/src/config.ts: unset/empty or relative VOICE_NOTE_DIR
# resolves against the repo root; absolute paths pass through unchanged.
VOICE_NOTE_DIR="${VOICE_NOTE_DIR:-./var/voice-notes}"
case "$VOICE_NOTE_DIR" in
  /*) NOTE_DIR="$VOICE_NOTE_DIR" ;;
  *)  NOTE_DIR="$REPO_ROOT/${VOICE_NOTE_DIR#./}" ;;
esac

fail=0

# VOICE_NOTE_MAX_BYTES: numeric when set (the API silently falls back to 8 MiB
# on garbage values — surface the misconfiguration here instead).
if [ -n "${VOICE_NOTE_MAX_BYTES:-}" ]; then
  if [[ "$VOICE_NOTE_MAX_BYTES" =~ ^[0-9]+$ ]]; then
    printf 'OK   VOICE_NOTE_MAX_BYTES=%s\n' "$VOICE_NOTE_MAX_BYTES"
  else
    printf 'FAIL VOICE_NOTE_MAX_BYTES=%s is not a positive integer\n' "$VOICE_NOTE_MAX_BYTES"
    fail=1
  fi
fi

if mkdir -p "$NOTE_DIR" 2>/dev/null; then
  printf 'OK   voice-note dir exists %s\n' "$NOTE_DIR"
else
  printf 'FAIL cannot create voice-note dir %s (check permissions, ownership, or systemd ReadWritePaths)\n' "$NOTE_DIR"
  fail=1
fi

PROBE="$NOTE_DIR/.write-probe.$$"
if touch "$PROBE" 2>/dev/null; then
  rm -f "$PROBE"
  printf 'OK   voice-note dir writable %s\n' "$NOTE_DIR"
else
  printf 'FAIL cannot write to voice-note dir %s (the API must be able to store recordings there)\n' "$NOTE_DIR"
  fail=1
fi

exit "$fail"
