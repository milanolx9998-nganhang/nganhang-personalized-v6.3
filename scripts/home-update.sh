#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/home-common.sh"
: "${VERIFIED_RELEASE_SHA256:?Provide verified clean release SHA256}"
: "${RELEASE_ZIP:?Provide absolute release ZIP path}"
test "${RELEASE_ZIP:0:1}" = / || exit 1
printf '%s  %s\n' "$VERIFIED_RELEASE_SHA256" "$RELEASE_ZIP" | sha256sum -c -
# Run from a NEW, already extracted release directory with its own private .env.home.
# Dependencies are installed with npm ci before this command; no live tree is overwritten.
node "$APP_ROOT/scripts/verify-deployment.mjs"
bash "$APP_ROOT/scripts/home-backup.sh"
bash "$APP_ROOT/scripts/home-start.sh"
echo 'HOME đã cập nhật và health đạt. Chưa nghiệm thu UAT/parity; SCHOOL không bị thay đổi.'
