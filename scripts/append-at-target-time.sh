#!/usr/bin/env bash
set -euo pipefail

TARGET_TIME="${1:-08:59:59.650}"
APPEND_URL="${APPEND_URL:-http://127.0.0.1:3000/api/append-koc}"
LOG_FILE="${LOG_FILE:-/home/ubuntu/lark-koc-cron.log}"

target_date="$(date '+%Y-%m-%d')"
target_epoch_ms="$(date -d "$target_date $TARGET_TIME" '+%s%3N')"
now_epoch_ms="$(date '+%s%3N')"
sleep_ms=$((target_epoch_ms - now_epoch_ms))

{
  echo "$(date '+%Y-%m-%d %H:%M:%S.%3N') append-wait-start target=$TARGET_TIME sleepMs=$sleep_ms"
} >> "$LOG_FILE" 2>&1

if [ "$sleep_ms" -gt 0 ]; then
  sleep_seconds="$(awk "BEGIN { printf \"%.3f\", $sleep_ms / 1000 }")"
  sleep "$sleep_seconds"
fi

{
  echo "$(date '+%Y-%m-%d %H:%M:%S.%3N') append-start target=$TARGET_TIME"
  curl -sS -w '\nHTTP_STATUS=%{http_code}\n' -X POST "$APPEND_URL"
  echo "$(date '+%Y-%m-%d %H:%M:%S.%3N') append-finished target=$TARGET_TIME"
} >> "$LOG_FILE" 2>&1
