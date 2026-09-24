#!/usr/bin/env bash
# Read-only check for the systemd + private Redis Home runtime.
# REQUIRE_REDIS=1 turns an unavailable Redis/cache into a failing check.
set -Eeuo pipefail

APP_HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"
SERVICE="${REDIS_SERVICE:-nganhang-redis.service}"
CONTAINER="${REDIS_CONTAINER:-nganhang-redis}"
REQUIRE_REDIS="${REQUIRE_REDIS:-0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

fail() { printf 'RUNTIME_CHECK_FAILED: %s\n' "$*" >&2; exit 1; }
command -v systemctl >/dev/null 2>&1 || fail 'systemctl không có trong PATH'
command -v docker >/dev/null 2>&1 || fail 'docker không có trong PATH'
command -v curl >/dev/null 2>&1 || fail 'curl không có trong PATH'
command -v python3 >/dev/null 2>&1 || fail 'python3 không có trong PATH'

redis_active=0
if [ "$(systemctl --user is-active "$SERVICE" 2>/dev/null || true)" = active ]; then
  redis_active=1
fi

if [ "$redis_active" = 1 ]; then
  command -v ss >/dev/null 2>&1 || fail 'ss không có trong PATH để kiểm tra bind'
  if ! ss -ltnH | awk '$4 == "127.0.0.1:6379" {found=1} END {exit found ? 0 : 1}'; then
    fail 'Redis không bind đúng 127.0.0.1:6379'
  fi
  if ss -ltnH | awk '$4 == "0.0.0.0:6379" || $4 == "[::]:6379" {found=1} END {exit found ? 0 : 1}'; then
    fail 'Redis đang bind public trên 0.0.0.0/::'
  fi
  [ "$(docker exec "$CONTAINER" redis-cli --raw PING 2>/dev/null || true)" = PONG ] || fail 'Redis không trả PONG'
  policy="$(docker exec "$CONTAINER" redis-cli --raw CONFIG GET maxmemory-policy 2>/dev/null | awk 'NR==2 {print; exit}' || true)"
  memory="$(docker exec "$CONTAINER" redis-cli --raw CONFIG GET maxmemory 2>/dev/null | awk 'NR==2 {print; exit}' || true)"
  appendonly="$(docker exec "$CONTAINER" redis-cli --raw CONFIG GET appendonly 2>/dev/null | awk 'NR==2 {print; exit}' || true)"
  printf 'REDIS_OK: policy=%s maxmemory=%s appendonly=%s\n' "$policy" "$memory" "$appendonly"
else
  printf 'REDIS_DEGRADED: %s is not active\n' "$SERVICE"
fi

health="$(curl -fsS -m 5 "$APP_HEALTH_URL" 2>/dev/null || true)"
if [ -z "$health" ]; then
  fail "health không đọc được: $APP_HEALTH_URL"
fi
python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception as exc:
    raise SystemExit(f"health JSON không hợp lệ: {exc}")
status = data.get("status", "unknown")
cache = data.get("cache", "unknown")
print(f"HEALTH status={status} cache={cache}")
if cache == "ok":
    print("CACHE_OK")
elif cache == "degraded":
    print("CACHE_DEGRADED")
else:
    raise SystemExit("cache state không xác định")
' <<<"$health"

if [ "$REQUIRE_REDIS" = 1 ] && [ "$redis_active" != 1 ]; then
  exit 2
fi
printf 'RUNTIME_CHECK_OK\n'
