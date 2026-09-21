#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/home-common.sh"
home_app stop
home_db stop
echo 'Đã dừng HOME; không xóa volume và không tác động SCHOOL.'
