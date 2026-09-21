#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/home-common.sh"
home_db config --quiet
home_app config --quiet
home_db up -d --wait
home_app build
# Dedicated staging database only; never copy School .env here.
home_app run --rm --no-deps app node -e "import('./src/config/profile.js').then(({profile})=>{if(profile.name!=='home-supabase')process.exit(1)})"
home_app run --rm --no-deps app node src/db/upgrade.js
home_app run --rm --no-deps app node scripts/supabase-private-bootstrap.mjs
home_app up -d --wait
home_app ps
