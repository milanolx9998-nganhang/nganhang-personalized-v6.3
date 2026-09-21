#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/home-common.sh"
: "${HOME_BACKUP_DIR:?Set an absolute dedicated backup directory}"
test "${HOME_BACKUP_DIR:0:1}" = / && test "$HOME_BACKUP_DIR" != / || exit 1
umask 077
folder="$HOME_BACKUP_DIR/$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p -- "$HOME_BACKUP_DIR"
mkdir -- "$folder"
test -d "$SUPABASE_HOME_DIR/volumes/storage"
# Maintenance window applies only to HOME. No retention/deletion is performed.
was_running="$(home_app ps --status running --services | grep -x app || true)"
if [ "$was_running" = app ]; then home_app stop app; fi
trap 'if [ "$was_running" = app ]; then home_app start app; fi' EXIT
home_db exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U postgres -d "$POSTGRES_DB" -Fc --no-owner' > "$folder/database.dump"
home_db exec -T db pg_restore --list < "$folder/database.dump" > "$folder/database.contents.txt"
tar -czf "$folder/storage.tar.gz" -C "$SUPABASE_HOME_DIR/volumes/storage" .
(cd -- "$folder" && sha256sum database.dump storage.tar.gz > SHA256SUMS)
echo "Backup HOME hoàn tất: $folder. Chưa xác nhận off-host; secret lưu riêng."
