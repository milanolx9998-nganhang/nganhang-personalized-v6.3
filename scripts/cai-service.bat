@echo off
REM ============================================================
REM NGAN HANG V4.3 - CAI DAT SERVICE (CHAY NEN TU DONG)
REM ============================================================
REM Chay file nay 1 LAN DUY NHAT voi quyen Administrator.
REM Sau khi cai:
REM   - Server tu dong chay khi may tinh khoi dong
REM   - Khong can bat tat moi ngay
REM   - Chay ngam, khong co cua so den
REM ============================================================

chcp 65001 >nul
title Cai Service Ngan Hang V4.3
cd /d "%~dp0\.."

REM Kiem tra quyen Administrator
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo [X] CAN QUYEN ADMINISTRATOR
    echo.
    echo Chuot phai vao file nay, chon "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   CAI SERVICE NGAN HANG V4.3
echo ============================================
echo   Sau khi cai xong, server se:
echo   - Tu dong chay khi may tinh bat
echo   - Chay ngam khong co cua so
echo   - Tu khoi dong lai neu bi crash
echo ============================================
echo.

set "PROJECT=%cd%"

REM --- Kiem tra .env ---
if not exist "backend\.env" (
    echo [X] Chua co backend\.env. Chay install-windows.ps1 truoc.
    pause
    exit /b 1
)

REM --- Cai node-windows (thu vien tao service) ---
echo [1/4] Cai dat node-windows...
cd backend
call npm install --save-dev node-windows@1.0.0-beta.8 2>&1 | findstr /V "warn deprecated"
cd ..

REM --- Tao script tao service ---
echo [2/4] Tao script install service...
(
echo const { Service } = require^('node-windows'^);
echo const path = require^('path'^);
echo const svc = new Service^({
echo   name: 'NganHangV4',
echo   description: 'Ngan Hang Cau Hoi V4.3 - Server mang LAN',
echo   script: path.join^('%PROJECT:\=\\%', 'backend', 'src', 'server.js'^),
echo   nodeOptions: [],
echo   workingDirectory: path.join^('%PROJECT:\=\\%', 'backend'^),
echo   env: [
echo     { name: 'NODE_ENV', value: 'production' }
echo   ]
echo }^);
echo svc.on^('install', ^(^) =^> {
echo   console.log^('[OK] Da cai service NganHangV4'^);
echo   svc.start^(^);
echo }^);
echo svc.on^('start', ^(^) =^> {
echo   console.log^('[OK] Service da khoi dong'^);
echo   console.log^('Server: http://localhost:3000'^);
echo }^);
echo svc.on^('error', ^(err^) =^> {
echo   console.error^('[X] Loi:', err^);
echo }^);
echo svc.install^(^);
) > backend\_install-service.js

REM --- Chay script cai service ---
echo [3/4] Dang cai service (may mat 30 giay)...
cd backend
node _install-service.js
cd ..

REM Doi service khoi dong
timeout /t 10 /nobreak >nul

REM --- Mo firewall ---
echo [4/4] Mo firewall cho port 3000...
netsh advfirewall firewall show rule name="Nganhang V4" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="Nganhang V4" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
    echo   [OK] Da mo firewall
) else (
    echo   [OK] Firewall da mo tu truoc
)

REM --- Kiem tra server ---
echo.
echo Kiem tra server...
timeout /t 3 /nobreak >nul
curl -s http://127.0.0.1:3000/api/health > _check.txt 2>&1
findstr "ok" _check.txt >nul 2>&1
if %errorlevel%==0 (
    echo   [OK] Server dang chay!
) else (
    echo   [!] Server chua phan hoi, cho them vai giay...
    timeout /t 5 /nobreak >nul
    curl -s http://127.0.0.1:3000/api/health > _check.txt 2>&1
    findstr "ok" _check.txt >nul 2>&1
    if %errorlevel%==0 (
        echo   [OK] Server dang chay!
    ) else (
        echo   [X] Server chua chay. Kiem tra log:
        echo       services.msc -^> tim "NganHangV4" -^> chuot phai -^> Properties
    )
)
del _check.txt 2>nul

echo.
echo ============================================
echo   CAI DAT HOAN TAT
echo ============================================
echo.
echo Server se TU DONG chay moi khi may bat.
echo.
echo Truy cap tu trinh duyet:
echo   Tren may nay:     http://localhost:3000
echo   Tu may khac LAN:  http://^<IP-may-chu^>:3000
echo.
echo Neu muon tam dung/khoi dong lai:
echo   services.msc -^> NganHangV4 -^> Stop / Start
echo.
echo Neu muon go service:
echo   scripts\go-service.bat
echo.
pause
