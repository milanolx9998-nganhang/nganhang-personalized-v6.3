#!/usr/bin/env bash
# Install the pinned, private Redis systemd user service used by the Home runtime.
# No application secret is read or written by this script.
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_SOURCE="$APP_DIR/deploy/systemd/nganhang-redis.service"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_TARGET="$UNIT_DIR/nganhang-redis.service"
SERVICE="nganhang-redis.service"
IMAGE="redis@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

fail() { printf 'REDIS_PROVISION_FAILED: %s\n' "$*" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || fail 'docker không có trong PATH'
command -v systemctl >/dev/null 2>&1 || fail 'systemctl không có trong PATH'
[ -f "$UNIT_SOURCE" ] || fail "thiếu unit template: $UNIT_SOURCE"

# Pull only the immutable digest; never use a floating Redis tag here.
printf 'Pull Redis image digest…\n'
docker pull "$IMAGE" >/dev/null
mkdir -p "$UNIT_DIR"
install -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE"

if [ "$(systemctl --user is-active "$SERVICE")" != active ]; then
  systemctl --user status "$SERVICE" --no-pager || true
  fail "$SERVICE chưa active"
fi
printf 'REDIS_PROVISION_OK: %s active, loopback-only, 256mb allkeys-lru, no persistence\n' "$SERVICE"
