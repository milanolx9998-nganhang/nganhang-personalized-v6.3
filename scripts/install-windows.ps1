# ============================================================
# NGAN HANG V4.3 - INSTALL SCRIPT FOR WINDOWS
# ============================================================
# Chay voi quyen Administrator:
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\install-windows.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ----- Utility -----
function Write-Header($text) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
}

function Write-OK($text)    { Write-Host "  [OK] $text" -ForegroundColor Green }
function Write-Warn($text)  { Write-Host "  [!]  $text" -ForegroundColor Yellow }
function Write-Err($text)   { Write-Host "  [X]  $text" -ForegroundColor Red }

# Check admin
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# ----- Start -----
Write-Header "NGAN HANG V4.3 - CAI DAT LAN DAU"

# ----- 1. Check Node.js -----
Write-Header "1. Kiem tra Node.js"
try {
    $nodeVer = node --version
    Write-OK "Node.js $nodeVer"
    $majorVer = [int]($nodeVer -replace 'v([0-9]+)\..*', '$1')
    if ($majorVer -lt 18) {
        Write-Err "Can Node.js 18 tro len. Tai tai: https://nodejs.org/"
        exit 1
    }
} catch {
    Write-Err "Chua cai Node.js!"
    Write-Host "       Tai va cai: https://nodejs.org/ (chon LTS)"
    exit 1
}

# ----- 2. Check PostgreSQL -----
Write-Header "2. Kiem tra PostgreSQL"
$pgBin = "C:\Program Files\PostgreSQL\16\bin"
if (-not (Test-Path $pgBin)) {
    $pgBin = "C:\Program Files\PostgreSQL\15\bin"
}
if (-not (Test-Path $pgBin)) {
    Write-Err "Chua cai PostgreSQL 15 hoac 16!"
    Write-Host "       Tai va cai: https://www.postgresql.org/download/windows/"
    Write-Host "       Khi cai nho GI NHO mat khau cua user 'postgres'"
    exit 1
}
Write-OK "PostgreSQL co tai: $pgBin"

# Check service dang chay
$pgService = Get-Service -Name "postgresql-*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pgService -and $pgService.Status -ne "Running") {
    Write-Warn "Service $($pgService.Name) chua chay, dang khoi dong..."
    Start-Service $pgService.Name
    Start-Sleep -Seconds 2
}
if ($pgService) {
    Write-OK "Service: $($pgService.Name) - $($pgService.Status)"
}

# ----- 3. Lay mat khau -----
Write-Header "3. Cau hinh database"

$postgresPass = Read-Host "Mat khau cua user 'postgres' (goc, do anh dat khi cai PostgreSQL)" -AsSecureString
$postgresPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($postgresPass))

$nganhangPass = Read-Host "Mat khau moi cho user 'nganhang' (se tao moi, nho GHI CHU LAI)" -AsSecureString
$nganhangPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($nganhangPass))

if ([string]::IsNullOrWhiteSpace($nganhangPassPlain)) {
    Write-Err "Mat khau nganhang khong duoc de trong"
    exit 1
}

# ----- 4. Create DB + user -----
Write-Header "4. Tao database va user"

$env:PGPASSWORD = $postgresPassPlain
$psql = Join-Path $pgBin "psql.exe"

# Check exist
$userExists = & $psql -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='nganhang'" 2>&1
if ($userExists -match "^1$") {
    Write-Warn "User 'nganhang' da ton tai, cap nhat mat khau..."
    & $psql -U postgres -c "ALTER USER nganhang WITH PASSWORD '$nganhangPassPlain';" | Out-Null
} else {
    Write-Host "  Tao user 'nganhang'..."
    & $psql -U postgres -c "CREATE USER nganhang WITH PASSWORD '$nganhangPassPlain' CREATEDB;" | Out-Null
}
Write-OK "User nganhang san sang"

$dbExists = & $psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='nganhang_v4'" 2>&1
if ($dbExists -match "^1$") {
    Write-Warn "Database 'nganhang_v4' da ton tai"
    $reset = Read-Host "  Xoa va tao lai database? (go 'xoa' de xoa, Enter de giu)"
    if ($reset -eq "xoa") {
        & $psql -U postgres -c "DROP DATABASE nganhang_v4;" | Out-Null
        & $psql -U postgres -c "CREATE DATABASE nganhang_v4 OWNER nganhang;" | Out-Null
        Write-OK "Da tao lai database"
    }
} else {
    & $psql -U postgres -c "CREATE DATABASE nganhang_v4 OWNER nganhang;" | Out-Null
    Write-OK "Da tao database nganhang_v4"
}

& $psql -U postgres -d nganhang_v4 -c "GRANT ALL ON SCHEMA public TO nganhang;" | Out-Null
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

# ----- 5. Create .env -----
Write-Header "5. Tao file cau hinh .env"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot "backend\.env"
$jwtSecret = [Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Max 256) }))

$envContent = @"
# Ngan Hang V4.3 - Cau hinh
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=nganhang_v4
DB_USER=nganhang
DB_PASSWORD=$nganhangPassPlain

JWT_SECRET=$jwtSecret
JWT_EXPIRES_IN=7d

UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=10485760

CORS_ORIGIN=*
"@

Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-OK "Da luu: $envPath"

# ----- 6. Install npm packages -----
Write-Header "6. Cai package Node.js"

# Xoa node_modules hoisted cu (tu V4.2 workspace)
$rootNodeMods = Join-Path $projectRoot "node_modules"
if (Test-Path $rootNodeMods) {
    Write-Host "  Xoa node_modules hoisted cu..."
    Remove-Item -Recurse -Force $rootNodeMods -ErrorAction SilentlyContinue
}
$rootLock = Join-Path $projectRoot "package-lock.json"
if (Test-Path $rootLock) {
    Remove-Item -Force $rootLock -ErrorAction SilentlyContinue
}

Push-Location (Join-Path $projectRoot "backend")
# Xoa node_modules cu cua backend neu co
if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue }
if (Test-Path "package-lock.json") { Remove-Item -Force "package-lock.json" -ErrorAction SilentlyContinue }
Write-Host "  Cai backend..."
npm install --no-audit --no-fund 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Err "Loi npm install backend"; Pop-Location; exit 1 }
Write-OK "Backend done"
Pop-Location

Push-Location (Join-Path $projectRoot "frontend")
if (-not (Test-Path "dist")) {
    # Xoa node_modules cu cua frontend neu co
    if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue }
    if (Test-Path "package-lock.json") { Remove-Item -Force "package-lock.json" -ErrorAction SilentlyContinue }
    Write-Host "  Cai frontend + build..."
    npm install --no-audit --no-fund 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Err "Loi npm install frontend"; Pop-Location; exit 1 }
    npm run build 2>&1 | Out-Null
    Write-OK "Frontend build done"
} else {
    Write-OK "Frontend dist da co san (pre-built)"
}
Pop-Location

# ----- 7. Migrate DB -----
Write-Header "7. Tao bang va nap du lieu mau"

Push-Location (Join-Path $projectRoot "backend")

Write-Host "  Chay migration..."
node src/db/migrate.js 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Err "Migration that bai"; Pop-Location; exit 1 }
Write-OK "Da tao 13 bang + indexes"

Write-Host "  Seed du lieu co ban..."
node src/db/seed.js 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Err "Seed that bai"; Pop-Location; exit 1 }
Write-OK "Da nap: 5 to, 14 mon, 3 phan mon KHTN, 9 users"

Write-Host "  Seed 51 bai KHTN 9..."
node src/db/seed-khtn9.js 2>&1 | Out-Null
Write-OK "Da nap 51 bai KHTN 9"

Pop-Location

# ----- 8. Firewall -----
Write-Header "8. Mo cong 3000 tren firewall"

if ($isAdmin) {
    $existing = Get-NetFirewallRule -DisplayName "Nganhang V4" -ErrorAction SilentlyContinue
    if ($existing) {
        Write-OK "Rule da ton tai"
    } else {
        New-NetFirewallRule -DisplayName "Nganhang V4" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow | Out-Null
        Write-OK "Da mo cong 3000"
    }
} else {
    Write-Warn "Khong co quyen Admin, bo qua firewall."
    Write-Host "       Neu may khac vao khong duoc, chay: netsh advfirewall firewall add rule name=`"Nganhang V4`" dir=in action=allow protocol=TCP localport=3000"
}

# ----- DONE -----
Write-Header "CAI DAT HOAN TAT!"
Write-Host ""
Write-Host "Buoc tiep theo:"
Write-Host ""
Write-Host "  CACH 1 - Treo luon (khuyen cao):" -ForegroundColor Yellow
Write-Host "    Chuot phai vao: scripts\cai-service.bat -> Run as administrator"
Write-Host ""
Write-Host "  CACH 2 - Bat tay khi can:" -ForegroundColor Yellow
Write-Host "    Double-click: scripts\tao-shortcut-desktop.bat"
Write-Host "    Roi bat/tat bang 3 icon tren Desktop"
Write-Host ""
Write-Host "Sau khi chay, mo trinh duyet:"
Write-Host "  http://localhost:3000"
Write-Host ""
Write-Host "Tai khoan: admin / admin123 (nho doi mat khau ngay)" -ForegroundColor Green
Write-Host ""
