#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
: "${SUPABASE_HOME_DIR:?Set absolute path to dedicated home Supabase docker directory}"
test "${SUPABASE_HOME_DIR:0:1}" = / || { echo 'Supabase path must be absolute' >&2; exit 1; }
test -f "$SUPABASE_HOME_DIR/docker-compose.yml"
test -f "$APP_ROOT/deploy/.env.home"
command -v docker >/dev/null
home_app() { docker compose --project-name nganhang-home-app --env-file "$APP_ROOT/deploy/.env.home" -f "$APP_ROOT/deploy/compose.home.yaml" "$@"; }
home_db() { docker compose --project-name nganhang-home-supabase --project-directory "$SUPABASE_HOME_DIR" --env-file "$SUPABASE_HOME_DIR/.env" -f "$SUPABASE_HOME_DIR/docker-compose.yml" -f "$APP_ROOT/deploy/supabase.private.override.yaml" "$@"; }
