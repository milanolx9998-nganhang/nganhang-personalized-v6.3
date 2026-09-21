#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/home-common.sh"
: "${RESTORE_BACKUP_DIR:?Set absolute backup directory}"
test "${RESTORE_BACKUP_DIR:0:1}" = / || exit 1
(cd -- "$RESTORE_BACKUP_DIR" && sha256sum -c SHA256SUMS)
target="nganhang_restore_test_$(date -u +%Y%m%d%H%M%S)"
home_db exec -T db createdb -U postgres "$target"
home_db exec -T db pg_restore -U postgres --no-owner --no-privileges --exit-on-error -d "$target" < "$RESTORE_BACKUP_DIR/database.dump"
home_db exec -T db psql -U postgres -d "$target" -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS questions FROM public.questions'
tar -tzf "$RESTORE_BACKUP_DIR/storage.tar.gz" >/dev/null
echo "Đã kiểm tra phục hồi DB riêng $target và đọc archive Storage. DB test được giữ lại; chưa UAT tệp/ứng dụng sau restore."
