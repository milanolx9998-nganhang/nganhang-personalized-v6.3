#!/bin/bash
# V6.6.4 safe auto-deploy.
# Order is load-bearing: lock -> record SHAs -> fetch -> migration safety gate -> build ->
# backup -> migrate -> restart -> polled health -> rollback app on failure.
# Never logs env values or secrets; never packages .env.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/home/hieu/nganhang-personalized-v6.3}"
SERVICE="${SERVICE:-nganhang.service}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"
HEALTH_PORT="${HEALTH_PORT:-3001}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"
LOCK_FILE="${LOCK_FILE:-/tmp/nganhang-deploy.lock}"

log() { echo "[deploy] $*"; }

# --- Deploy lock: two pushes must never deploy on top of each other (§6) -------------------
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Một tiến trình deploy khác đang chạy. Bỏ qua lần này."
  echo "DEPLOY_SKIPPED_LOCK_HELD"
  exit 0
fi

cd "$APP_DIR"

PREVIOUS_SHA="$(git rev-parse HEAD)"
log "PREVIOUS_SHA=$PREVIOUS_SHA"

git fetch origin main
TARGET_SHA="$(git rev-parse origin/main)"
log "TARGET_SHA=$TARGET_SHA"

if [ "$PREVIOUS_SHA" = "$TARGET_SHA" ]; then
  log "Không có commit mới."
fi

# --- §7 Migration rule: additive + backward-compatible only -------------------------------
CHANGED_SQL="$(git diff --name-only "$PREVIOUS_SHA" "$TARGET_SHA" -- 'backend/src/db/*.sql' || true)"
if [ -n "$CHANGED_SQL" ]; then
  log "Migration thay đổi:"
  echo "$CHANGED_SQL" | sed 's/^/  /'
  # shellcheck disable=SC2086
  if ! node scripts/migration-safety.mjs $CHANGED_SQL; then
    log "Migration có lệnh phá hủy dữ liệu — dừng trước khi đổi source."
    echo "DEPLOY_BLOCKED_MANUAL_MIGRATION_REQUIRED"
    exit 3
  fi
fi

install_deps() {
  local dir="$1"
  cd "$APP_DIR/$dir"
  if [ -f package-lock.json ]; then
    npm ci --no-audit --fund=false
  else
    log "$dir: không có package-lock.json hợp lệ, dùng npm install"
    npm install --no-audit --fund=false
  fi
}

build_app() {
  install_deps frontend
  cd "$APP_DIR/frontend" && npm run build
  install_deps backend
}

diagnostics() {
  log "--- systemctl status ---"
  systemctl --user status "$SERVICE" --no-pager || true
  log "--- journalctl (200 dòng cuối) ---"
  journalctl --user -u "$SERVICE" -n 200 --no-pager || true
  log "--- listener trên cổng $HEALTH_PORT ---"
  ss -ltnp | grep ":$HEALTH_PORT" || true
}

# §8 Poll, never a single sleep+curl.
wait_healthy() {
  local waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    if curl -s -f -m 5 "$HEALTH_URL" > /dev/null 2>&1; then
      log "Health OK sau ${waited}s."
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  log "Health FAIL sau ${HEALTH_TIMEOUT}s."
  return 1
}

# --- Apply target source ------------------------------------------------------------------
git reset --hard "$TARGET_SHA"
build_app

# --- Backup gate: backup fail => không migrate (§6) ----------------------------------------
if [ -n "$CHANGED_SQL" ] || [ "${FORCE_BACKUP:-0}" = "1" ]; then
  log "Sao lưu trước migration…"
  cd "$APP_DIR/backend"
  if ! node ../scripts/backup.mjs; then
    log "Sao lưu thất bại — không chạy migration, không restart."
    echo "DEPLOY_BLOCKED_BACKUP_FAILED"
    git reset --hard "$PREVIOUS_SHA"
    exit 4
  fi
  log "Sao lưu xong."
else
  log "Không có migration mới; bỏ qua bước sao lưu bắt buộc."
fi

# --- Migration: fail => không restart ------------------------------------------------------
cd "$APP_DIR/backend"
if ! npm run migrate; then
  log "Migration thất bại — giữ nguyên dịch vụ đang chạy, không restart."
  echo "DEPLOY_FAILED_MIGRATION"
  exit 5
fi

# --- Restart + polled health ---------------------------------------------------------------
log "Khởi động lại $SERVICE…"
systemctl --user restart "$SERVICE"

if wait_healthy; then
  log "Triển khai thành công: $PREVIOUS_SHA -> $TARGET_SHA"
  echo "DEPLOY_OK"
  exit 0
fi

# --- §9 Rollback app only. DB không tự rollback vì migration đã được ép additive -------------
diagnostics
log "Rollback ứng dụng về $PREVIOUS_SHA…"
cd "$APP_DIR"
git reset --hard "$PREVIOUS_SHA"

if build_app && systemctl --user restart "$SERVICE" && wait_healthy; then
  log "Đã khôi phục bản trước. Migration mới vẫn nằm trong DB (additive nên bản cũ chạy được)."
  echo "DEPLOY_FAILED_ROLLED_BACK_APP"
  exit 6
fi

diagnostics
log "Rollback không khôi phục được dịch vụ. Cần can thiệp thủ công."
echo "DEPLOY_FAILED_NOT_RECOVERED"
exit 7
