@echo off
REM ============================================================
REM NGAN HANG V4.5 - KHOI TAO DATABASE
REM ============================================================
REM Script nay se HOI truoc khi xoa du lieu cu.
REM   - Lan dau: chon N (khong xoa) neu DB trong
REM   - Reset: chon Y (XOA TAT CA) de tao lai sach
REM ============================================================

chcp 65001 >nul
title Khoi tao database
cd /d "%~dp0\.."

echo.
echo ============================================
echo   KHOI TAO DATABASE NGAN HANG V4.5
echo ============================================
echo.

REM --- Check .env ---
if not exist "backend\.env" (
    echo [X] Khong tim thay backend\.env
    echo     Chay install-windows.ps1 truoc.
    pause
    exit /b 1
)

REM --- Check node_modules backend ---
if not exist "backend\node_modules" (
    echo [!] Backend chua cai node_modules, dang cai...
    cd backend
    call npm install --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo [X] Loi npm install
        cd ..
        pause
        exit /b 1
    )
    cd ..
)

echo Cau hoi: Database da co san bang cu khong (VD tu V2, V4.2)?
echo.
echo   - Neu LAN DAU cai dat: chon N
echo   - Neu da cai truoc va gap loi migration: chon Y de xoa sach va tao lai
echo.
choice /C YN /M "Xoa sach du lieu cu truoc khi tao"

set RESET_FLAG=
if not errorlevel 2 (
    echo.
    echo [!] CANH BAO: Se xoa TAT CA du lieu trong database nganhang_v4!
    choice /C YN /M "Ban co THAT SU muon xoa tat ca"
    if errorlevel 2 (
        echo Huy lenh reset.
        set RESET_FLAG=
    ) else (
        set RESET_FLAG=--reset
    )
)

echo.
echo [1/3] Tao bang (migration)...
cd backend
if defined RESET_FLAG (
    call node src\db\migrate.js --reset
) else (
    call node src\db\migrate.js
)
if %errorlevel% neq 0 (
    echo.
    echo [X] Migration that bai!
    echo.
    echo Neu loi "cannot be implemented" hoac "already exists":
    echo    Database co bang cu khac schema. Chay lai file nay
    echo    va chon Y de reset.
    echo.
    cd ..
    pause
    exit /b 1
)
cd ..
echo   [OK] Da tao bang

echo.
echo [1b/3] Nang cap V4.5 (Item Analysis + Image)...
cd backend
if exist "src\db\migration-v45.sql" (
    for /f "tokens=*" %%i in ('node -e "require('dotenv').config();const u=process.env.DATABASE_URL;console.log(u)"') do set DB_URL=%%i
    psql "%DB_URL%" -f src\db\migration-v45.sql 2>nul
    if %errorlevel% neq 0 (
        echo   [!] Khong chay duoc migration-v45 qua psql, thu qua node...
        node -e "import('dotenv/config').then(()=>import('./src/db/pool.js')).then(m=>m.pool.query(require('fs').readFileSync('./src/db/migration-v45.sql','utf8')).then(()=>{console.log('[OK] Migration V4.5');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)}))" 2>nul
    )
)
cd ..
echo   [OK] V4.5 tables

echo.
echo [1c/3] Nang cap V4.6 (MathJax + Version History)...
cd backend
if exist "src\db\migration-v46.sql" (
    for /f "tokens=*" %%i in ('node -e "require('dotenv').config();const u=process.env.DATABASE_URL;console.log(u)"') do set DB_URL=%%i
    psql "%DB_URL%" -f src\db\migration-v46.sql 2>nul
    if %errorlevel% neq 0 (
        echo   [!] Khong chay duoc migration-v46 qua psql, thu qua node...
        node -e "import('dotenv/config').then(()=>import('./src/db/pool.js')).then(m=>m.pool.query(require('fs').readFileSync('./src/db/migration-v46.sql','utf8')).then(()=>{console.log('[OK] Migration V4.6');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)}))" 2>nul
    )
)
cd ..
echo   [OK] V4.6 options

echo.
echo [2/3] Nap du lieu co ban...
cd backend
call node src\db\seed.js
if %errorlevel% neq 0 (
    echo [X] Seed that bai
    cd ..
    pause
    exit /b 1
)
cd ..
echo   [OK] 14 mon, 3 phan mon KHTN, 9 users

echo.
echo [3/3] Nap 51 bai KHTN 9...
cd backend
call node src\db\seed-khtn9.js
cd ..
echo   [OK]

echo.
echo ============================================
echo   KHOI TAO THANH CONG
echo ============================================
echo.
echo Tai khoan mac dinh:
echo   admin / admin123          (Quan tri)
echo   bgh / admin123            (BGH)
echo   gv_toan_01 / teacher123   (Giao vien Toan)
echo   gv_ly_01 / teacher123     (Giao vien Vat li)
echo.
echo Gio mo trinh duyet: http://localhost:3000
echo Neu server chua chay: scripts\start-server.bat
echo.
pause
