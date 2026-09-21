#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/home-common.sh"
home_app ps
home_db ps
home_app exec -T app node -e "fetch('http://127.0.0.1:3001/api/health').then(async r=>{console.log(await r.text());if(!r.ok)process.exit(1)})"
df -h "$SUPABASE_HOME_DIR"
free -m
